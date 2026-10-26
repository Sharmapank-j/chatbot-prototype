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
    raw = base64.b64decode(match.group(2), validate=False)
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


def make_tts(text: str, target: Path, scratch: Path) -> bool:
    if not text.strip() or not PIPER_MODEL or not command_available(PIPER):
        return False
    model = Path(PIPER_MODEL)
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
        host = (urlparse(origin).hostname or "").lower()
        if not origin or host in ("localhost", "127.0.0.1") or host.endswith(".vercel.app"):
            return origin or "*"
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
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self._json(404, {"error": "Not found"})
            return
        self._json(200, {
            "service": "indica-local-worker",
            "ffmpeg": command_available(FFMPEG),
            "ffprobe": command_available(FFPROBE),
            "piper": command_available(PIPER) and bool(PIPER_MODEL and Path(PIPER_MODEL).is_file()),
            "tokenRequired": True,
            "version": 1
        })

    def do_POST(self) -> None:
        if self.headers.get("Authorization", "") != "Bearer " + TOKEN:
            self._json(401, {"error": "Invalid local worker token. Start the worker and copy its token from the terminal."})
            return
        if urlparse(self.path).path != "/render":
            self._json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                self._json(413, {"error": "Render request must be between 1 byte and 180 MB."})
                return
            data = json.loads(self.rfile.read(length))
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
                    for index, shot in enumerate(shots):
                        if not isinstance(shot, dict):
                            raise ValueError("Invalid shot entry.")
                        duration = seconds(shot.get("duration"))
                        image = decode_image(str(shot.get("imageDataUrl", "")), root / f"source-{index:03}")
                        text = str(shot.get("dialogue", "")).strip()
                        voice = root / f"voice-{index:03}.wav"
                        has_voice = make_tts(text, voice, root)
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
                    manifest = {"formatVersion": 1, "fps": FPS, "width": width, "height": height, "duration": round(cursor, 6), "frames": total_frames, "ttsUsed": tts_used, "audio": "Piper local TTS" if tts_used else "silence (Piper not configured or no dialogue)", "videoCodec": "H.264", "audioCodec": "AAC", "subtitleCodec": "mov_text"}
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
    print(f"Piper TTS: {'configured' if command_available(PIPER) and PIPER_MODEL and Path(PIPER_MODEL).is_file() else 'not configured (video exports silence)' }", flush=True)
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
