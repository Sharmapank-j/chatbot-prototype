#!/usr/bin/env python3
"""Local-only Indica renderer: deterministic FFmpeg MP4 + Piper TTS audio exports.

Install FFmpeg and Piper separately. Configure INDICA_PIPER_MODEL and optionally
INDICA_PIPER_BIN / INDICA_WORKER_TOKEN. The server binds to loopback only.
"""
from __future__ import annotations

import base64
import io
import json
import hashlib
import os
import urllib.request
import urllib.error
import re
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("INDICA_WORKER_PORT", "8765"))
TOKEN = os.environ.get("INDICA_WORKER_TOKEN", "").strip() or base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
FFMPEG = os.environ.get("INDICA_FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("INDICA_FFPROBE_BIN", "ffprobe")
PIPER = os.environ.get("INDICA_PIPER_BIN", "piper")
PIPER_MODEL = os.environ.get("INDICA_PIPER_MODEL", "").strip()
PIPER_MODEL_HI = os.environ.get("INDICA_PIPER_MODEL_HI", "").strip()
PIPER_MODEL_EN = os.environ.get("INDICA_PIPER_MODEL_EN", "").strip()
LLAMA_SERVER = os.environ.get("INDICA_LLAMA_SERVER_BIN", "llama-server")
LLAMA_HOST = "127.0.0.1"
LLAMA_PORT = int(os.environ.get("INDICA_LLAMA_PORT", "8081"))
LLAMA_LOCK = threading.Lock()
LLAMA_PROCESS = None
LLAMA_MODEL_NAME = ""
MAX_MODEL_BYTES = int(os.environ.get("INDICA_MAX_GGUF_BYTES", str(200 * 1024 * 1024 * 1024)))
MAX_BODY = 180 * 1024 * 1024
MAX_SHOTS = 30
FPS = 24
RENDER_LOCK = threading.Lock()
ALLOWED_IMAGE = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$")


def command_available(command: str) -> bool:
    return bool(shutil.which(command) or Path(command).is_file())


def decode_image(data_url: str, destination: Path) -> Path:
    match = ALLOWED_IMAGE.fullmatch(data_url)
    if not match:
        raise ValueError("Each shot needs a base64 PNG, JPEG or WEBP source image.")
    raw = base64.b64decode(match.group(2).replace("\r", "").replace("\n", ""), validate=True)
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise ValueError("Each rendered image must be no larger than 8 MB.")
    suffix = {"png": ".png", "jpeg": ".jpg", "webp": ".webp"}[match.group(1)]
    image_path = destination.with_suffix(suffix)
    image_path.write_bytes(raw)
    return image_path


def seconds(value: object, default: float = 3.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        result = default
    if not (0.25 <= result <= 60):
        raise ValueError("Shot duration must be between 0.25 and 60 seconds.")
    return result


def srt_time(value: float) -> str:
    ms = max(0, round(value * 1000))
    hours, rem = divmod(ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def run(command: list[str], timeout: int = 300) -> None:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode:
        message = (result.stderr or result.stdout or "External media command failed")[-3000:]
        raise RuntimeError(message)


def media_duration(path: Path) -> float:
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, timeout=30, check=False
    )
    if result.returncode:
        raise RuntimeError((result.stderr or "Could not inspect local TTS audio duration")[-2000:])
    return max(0.0, float(result.stdout.strip()))


def make_tts(text: str, target: Path, scratch: Path, language: str = "hi") -> bool:
    selected_model = (PIPER_MODEL_EN if language == "en" else PIPER_MODEL_HI) or PIPER_MODEL
    if not text.strip() or not selected_model or not command_available(PIPER):
        return False
    model = Path(selected_model)
    if not model.is_file():
        raise RuntimeError("INDICA_PIPER_MODEL does not point to an existing .onnx voice model.")
    config = Path(str(model) + ".json")
    cmd = [PIPER, "--model", str(model), "--output_file", str(target)]
    if config.is_file():
        cmd.extend(["--config", str(config)])
    result = subprocess.run(cmd, input=text.strip(), capture_output=True, text=True, timeout=120, check=False)
    if result.returncode:
        raise RuntimeError((result.stderr or "Piper TTS failed")[-2000:])
    return target.is_file() and target.stat().st_size > 44


class Handler(BaseHTTPRequestHandler):
    server_version = "IndicaLocalWorker/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print("[indica-worker] " + (fmt % args), flush=True)

    def _origin(self) -> str:
        origin = self.headers.get("Origin", "")
        if not origin:
            return ""
        try:
            parsed = urlparse(origin)
            host = (parsed.hostname or "").lower()
            if parsed.scheme == "http" and host in ("localhost", "127.0.0.1", "::1"):
                return origin
            if parsed.scheme == "https" and host.endswith(".vercel.app"):
                return origin
        except Exception:
            pass
        return ""

    def _headers(self, content_type: str = "application/json", length: int | None = None) -> None:
        origin = self._origin()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def _json(self, status: int, value: dict) -> None:
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        origin = self._origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        origin = self._origin()
        if not origin:
            self.send_error(403, "Origin not allowed")
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/health", "/llama/status"):
            llama = self._llama_health()
            if path == "/llama/status":
                self._json(200, llama)
                return
            self._json(200, {
                "service": "indica-local-worker", "ffmpeg": command_available(FFMPEG),
                "ffprobe": command_available(FFPROBE),
                "piper": command_available(PIPER) and any(Path(model).is_file() for model in (PIPER_MODEL, PIPER_MODEL_HI, PIPER_MODEL_EN) if model),
                "llamaCpp": llama["ready"], "llamaModel": LLAMA_MODEL_NAME or None,
                "tokenRequired": True, "version": 2
            })
            return
        self._json(404, {"error": "Not found"})

    def _llama_health(self) -> dict:
        try:
            with urllib.request.urlopen(f"http://{LLAMA_HOST}:{LLAMA_PORT}/health", timeout=1) as response:
                data = json.loads(response.read(65536))
            return {"ready": data.get("status", "ok") in ("ok", "no slot available"), "model": LLAMA_MODEL_NAME or None, "baseUrl": f"http://{LLAMA_HOST}:{LLAMA_PORT}/v1"}
        except Exception:
            return {"ready": False, "model": LLAMA_MODEL_NAME or None, "baseUrl": f"http://{LLAMA_HOST}:{LLAMA_PORT}/v1"}

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            raise ValueError("Request must be between 1 byte and 180 MB.")
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError("Request body must be a JSON object.")
        return data

    def _require_token(self) -> bool:
        if self.headers.get("Authorization", "") != "Bearer " + TOKEN:
            self._json(401, {"error": "Invalid local worker token."})
            return False
        return True

    def do_POST(self) -> None:
        global LLAMA_PROCESS, LLAMA_MODEL_NAME
        path = urlparse(self.path).path
        if path == "/llama/load":
            if not self._require_token():
                return
            try:
                data = self._read_json_body()
                model_path = Path(str(data.get("modelPath", ""))).expanduser().resolve()
                if model_path.suffix.lower() != ".gguf" or not model_path.is_file():
                    self._json(400, {"error": "Choose an existing local .gguf model file."})
                    return
                if model_path.stat().st_size <= 0 or model_path.stat().st_size > MAX_MODEL_BYTES:
                    self._json(413, {"error": "GGUF model exceeds the configured local model-size limit."})
                    return
                if not command_available(LLAMA_SERVER):
                    self._json(400, {"error": "llama-server is not installed or not on PATH. Install llama.cpp or connect to an already running local server."})
                    return
                wait_seconds = max(5, min(1800, int(data.get("waitSeconds", 90))))
                context = max(512, min(16384, int(data.get("contextTokens", 4096))))
                gpu_layers = max(-1, min(999, int(data.get("gpuLayers", -1))))
                with LLAMA_LOCK:
                    if LLAMA_PROCESS and LLAMA_PROCESS.poll() is None:
                        LLAMA_PROCESS.terminate()
                        try:
                            LLAMA_PROCESS.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            LLAMA_PROCESS.kill()
                    LLAMA_MODEL_NAME = model_path.name
                    log_path = Path(tempfile.gettempdir()) / "indica-llama-server.log"
                    log_handle = open(log_path, "w", encoding="utf-8")
                    LLAMA_PROCESS = subprocess.Popen([
                        LLAMA_SERVER, "--host", LLAMA_HOST, "--port", str(LLAMA_PORT),
                        "--model", str(model_path), "--alias", model_path.stem,
                        "--ctx-size", str(context), "--n-gpu-layers", str(gpu_layers)
                    ], stdout=log_handle, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
                deadline = time.time() + wait_seconds
                while time.time() < deadline:
                    if LLAMA_PROCESS.poll() is not None:
                        self._json(500, {"error": f"llama-server exited during model loading. Inspect its local log: {log_path}"})
                        return
                    if self._llama_health()["ready"]:
                        self._json(200, {"ready": True, "model": LLAMA_MODEL_NAME, "message": "GGUF model ready for local chat."})
                        return
                    time.sleep(1)
                self._json(202, {"ready": False, "model": LLAMA_MODEL_NAME, "message": "Model is still loading. Check status again."})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception as exc:
                self._json(500, {"error": str(exc)[:800]})
            return
        if path == "/llama/unload":
            if not self._require_token():
                return
            with LLAMA_LOCK:
                if LLAMA_PROCESS and LLAMA_PROCESS.poll() is None:
                    LLAMA_PROCESS.terminate()
                    try:
                        LLAMA_PROCESS.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        LLAMA_PROCESS.kill()
                LLAMA_PROCESS = None
                LLAMA_MODEL_NAME = ""
            self._json(200, {"ready": False, "message": "Local GGUF model unloaded."})
            return
        if path == "/llama/chat":
            if not self._require_token():
                return
            try:
                data = self._read_json_body()
                prompt = str(data.get("prompt", "")).strip()
                if not prompt or len(prompt) > 12000:
                    self._json(400, {"error": "Prompt must be between 1 and 12000 characters."})
                    return
                if not self._llama_health()["ready"]:
                    self._json(503, {"error": "No ready local llama.cpp server. Load a GGUF model first."})
                    return
                body = json.dumps({
                    "model": LLAMA_MODEL_NAME or "local-gguf",
                    "messages": [
                        {"role": "system", "content": str(data.get("system", "You are a comic-to-anime production assistant."))[:4000]},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.4, "max_tokens": max(64, min(4096, int(data.get("maxTokens", 1200))))
                }).encode()
                request = urllib.request.Request(
                    f"http://{LLAMA_HOST}:{LLAMA_PORT}/v1/chat/completions", data=body,
                    headers={"Content-Type": "application/json"}, method="POST"
                )
                with urllib.request.urlopen(request, timeout=300) as response:
                    result = json.loads(response.read(10 * 1024 * 1024))
                answer = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                if not isinstance(answer, str) or not answer.strip():
                    self._json(502, {"error": "Local llama.cpp returned an empty response."})
                    return
                self._json(200, {"text": answer.strip(), "model": LLAMA_MODEL_NAME, "local": True})
            except urllib.error.HTTPError as exc:
                self._json(502, {"error": f"llama.cpp returned HTTP {exc.code}."})
            except Exception as exc:
                self._json(502, {"error": f"Local llama.cpp request failed: {str(exc)[:400]}"})
            return
        if path != "/render":
            self._json(404, {"error": "Not found"})
            return
        if not self._require_token():
            return
        try:
            data = self._read_json_body()
            shots = data.get("shots")
            if not isinstance(shots, list) or not shots or len(shots) > MAX_SHOTS:
                raise ValueError("Render requires 1–30 storyboard shots.")
            aspect = data.get("aspect", "16:9")
            if aspect == "9:16":
                width, height = 720, 1280
            elif aspect == "1:1":
                width, height = 900, 900
            else:
                width, height = 1280, 720
            with RENDER_LOCK:
                with tempfile.TemporaryDirectory(prefix="indica-render-") as temp:
                    root = Path(temp)
                    clips: list[Path] = []
                    audio_files: list[Path] = []
                    subtitles: list[str] = []
                    cursor = 0.0
                    total_frames = 0
                    tts_used = False
                    shot_manifest: list[dict] = []
                    language = str(data.get("language", "hi"))
                    for index, shot in enumerate(shots):
                        if not isinstance(shot, dict):
                            raise ValueError("Invalid shot entry.")
                        duration = seconds(shot.get("duration"))
                        image = decode_image(str(shot.get("imageDataUrl", "")), root / f"source-{index:03}")
                        text = str(shot.get("dialogue", "")).strip()
                        voice = root / f"voice-{index:03}.wav"
                        has_voice = make_tts(text, voice, root, language)
                        tts_used = tts_used or has_voice
                        # Extend the shot slot when speech is longer so generated dialogue is not truncated.
                        if has_voice:
                            duration = max(duration, media_duration(voice) + 0.15)
                        if duration > 120:
                            raise ValueError("A shot cannot exceed 120 seconds after voice synchronization.")
                        frames = max(6, round(duration * FPS))
                        duration = frames / FPS
                        clip = root / f"clip-{index:03}.mp4"
                        zoom = float(shot.get("zoom", 1.04))
                        zoom = min(1.3, max(1.0, zoom))
                        vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},zoompan=z='min(zoom+{(zoom-1)/max(1,frames):.8f},{zoom:.4f})':d={frames}:s={width}x{height}:fps={FPS},format=yuv420p"
                        run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(image), "-vf", vf, "-frames:v", str(frames), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), str(clip)], timeout=180)
                        clips.append(clip)
                        shot_manifest.append({
                            "shotId": str(shot.get("id", index + 1)),
                            "title": str(shot.get("title", "Shot " + str(index + 1)))[:200],
                            "sourceSha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                            "durationSeconds": round(duration, 6),
                            "frameCount": frames,
                            "ttsUsed": has_voice
                        })
                        if has_voice:
                            fitted = root / f"audio-fit-{index:03}.wav"
                            run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(voice), "-af", f"apad=pad_dur={duration},atrim=duration={duration}", "-ar", "24000", "-ac", "1", str(fitted)])
                            audio_files.append(fitted)
                        else:
                            silence = root / f"silence-{index:03}.wav"
                            run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", f"{duration:.6f}", "-ar", "24000", "-ac", "1", str(silence)])
                            audio_files.append(silence)
                        if text:
                            subtitles.append(f"{len(subtitles)+1}\n{srt_time(cursor)} --> {srt_time(cursor+duration)}\n{text.replace(chr(10), ' ').replace(chr(13), ' ')}\n")
                        cursor += duration
                        total_frames += frames
                    concat_file = root / "concat.txt"
                    concat_file.write_text("".join(f"file '{clip.as_posix()}'\n" for clip in clips), encoding="utf-8")
                    raw_video = root / "video.mp4"
                    run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-c", "copy", "-movflags", "+faststart", str(raw_video)])
                    audio_list = root / "audio.txt"
                    audio_list.write_text("".join(f"file '{audio.as_posix()}'\n" for audio in audio_files), encoding="utf-8")
                    voice_track = root / "voice-track.wav"
                    run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(audio_list), "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1", str(voice_track)])
                    srt_file = root / "subtitles.srt"
                    srt_file.write_text("\n".join(subtitles), encoding="utf-8")
                    final_video = root / "episode.mp4"
                    # MP4 contains H.264 video and AAC voice audio; subtitles are embedded when available.
                    mux = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_video), "-i", str(voice_track)]
                    if subtitles:
                        mux.extend(["-i", str(srt_file), "-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0", "-c:s", "mov_text"])
                    else:
                        mux.extend(["-map", "0:v:0", "-map", "1:a:0"])
                    mux.extend(["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", f"{cursor:.6f}", "-movflags", "+faststart", str(final_video)])
                    run(mux)
                    # Probe actual output instead of relying only on FFmpeg exit status.
                    probe = subprocess.run(
                        [FFPROBE, "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels", "-show_entries", "format=duration", "-of", "json", str(final_video)],
                        capture_output=True, text=True, timeout=30, check=False
                    )
                    if probe.returncode:
                        raise RuntimeError("FFprobe could not validate the generated MP4.")
                    probe_data = json.loads(probe.stdout)
                    stream_list = probe_data.get("streams", [])
                    video_stream = next((stream for stream in stream_list if stream.get("codec_type") == "video"), None)
                    audio_stream = next((stream for stream in stream_list if stream.get("codec_type") == "audio"), None)
                    if not video_stream or video_stream.get("codec_name") != "h264":
                        raise RuntimeError("Rendered MP4 is missing an H.264 video stream.")
                    if not audio_stream or audio_stream.get("codec_name") != "aac":
                        raise RuntimeError("Rendered MP4 is missing an AAC audio stream.")
                    actual_duration = float(probe_data.get("format", {}).get("duration", 0))
                    if actual_duration < cursor - (1 / FPS) or actual_duration > cursor + 0.15:
                        raise RuntimeError("Rendered MP4 duration does not match its timeline.")
                    wav_probe = subprocess.run(
                        [FFPROBE, "-v", "error", "-show_entries", "stream=codec_type,codec_name,sample_rate,channels", "-show_entries", "format=duration", "-of", "json", str(voice_track)],
                        capture_output=True, text=True, timeout=30, check=False
                    )
                    if wav_probe.returncode:
                        raise RuntimeError("FFprobe could not validate the WAV voice track.")
                    wav_data = json.loads(wav_probe.stdout)
                    wav_stream = next((stream for stream in wav_data.get("streams", []) if stream.get("codec_type") == "audio"), None)
                    if not wav_stream or wav_stream.get("codec_name") != "pcm_s16le" or wav_stream.get("sample_rate") != "24000":
                        raise RuntimeError("Voice track must be 24 kHz PCM WAV.")
                    if abs(float(wav_data.get("format", {}).get("duration", 0)) - cursor) > 0.15:
                        raise RuntimeError("WAV voice-track duration does not match the timeline.")
                    manifest = {"formatVersion": 1, "fps": FPS, "width": width, "height": height, "duration": round(cursor, 6), "frames": total_frames, "ttsUsed": tts_used, "audio": "Piper local TTS" if tts_used else "silence (Piper not configured or no dialogue)", "videoCodec": "H.264", "audioCodec": "AAC", "subtitleCodec": "mov_text" if subtitles else None, "ffmpeg": FFMPEG, "ffprobe": FFPROBE, "validated": {"videoH264": True, "audioAAC": True, "voiceWavPcm24k": True, "durationSeconds": round(actual_duration, 6)}, "shots": shot_manifest}
                    manifest_file = root / "render-manifest.json"
                    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
                    bundle = io.BytesIO()
                    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
                        archive.write(final_video, "episode.mp4")
                        archive.write(voice_track, "voice-track.wav")
                        archive.write(srt_file, "subtitles.srt")
                        archive.write(manifest_file, "render-manifest.json")
                    payload = bundle.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="indica-render-bundle.zip"')
                self.send_header("Cache-Control", "no-store")
                origin = self._origin()
                if origin:
                    self.send_header("Access-Control-Allow-Origin", origin)
                    self.send_header("Vary", "Origin")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except ValueError as exc:
            self._json(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self._json(504, {"error": "FFmpeg or Piper timed out while rendering this project."})
        except Exception as exc:
            self._json(500, {"error": str(exc)[:2500] or "Local render failed."})


def main() -> None:
    if not command_available(FFMPEG):
        raise SystemExit(f"FFmpeg not found: {FFMPEG}. Install FFmpeg and add it to PATH.")
    if not command_available(FFPROBE):
        raise SystemExit(f"FFprobe not found: {FFPROBE}. Install FFmpeg (including FFprobe) and add it to PATH.")
    print(f"Indica local worker listening at http://{HOST}:{PORT}", flush=True)
    print(f"FFmpeg: {FFMPEG}", flush=True)
    piper_models = [model for model in (PIPER_MODEL, PIPER_MODEL_HI, PIPER_MODEL_EN) if model and Path(model).is_file()]
    print(f"Piper TTS: {'configured (' + str(len(piper_models)) + ' voice model(s))' if command_available(PIPER) and piper_models else 'not configured (video exports silence)' }", flush=True)
    print(f"Worker token (paste into Studio > Export): {TOKEN}", flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local worker.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
