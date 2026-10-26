import base64
import binascii
import importlib.util
import json
import shutil
import struct
import sys
import threading
import unittest
import urllib.error
import urllib.request
import zlib
import io
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "indica_local_worker.py"
SPEC = importlib.util.spec_from_file_location("indica_local_worker", MODULE_PATH)
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


class WorkerUnitTests(unittest.TestCase):
    def test_srt_time_is_stable_at_millisecond_precision(self):
        self.assertEqual(worker.srt_time(61.2346), "00:01:01,235")
        self.assertEqual(worker.srt_time(0), "00:00:00,000")

    def test_shot_duration_bounds(self):
        self.assertEqual(worker.seconds(3), 3.0)
        with self.assertRaises(ValueError):
            worker.seconds(0.1)
        with self.assertRaises(ValueError):
            worker.seconds(61)

    def test_image_decoder_rejects_non_image_payloads(self):
        with self.assertRaises(ValueError):
            worker.decode_image("data:image/svg+xml;base64,PHN2Zz4=", Path("unsafe"))

    def test_image_decoder_preserves_detected_image_extension(self):
        # 1x1 transparent PNG.
        payload = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7ioAAAAASUVORK5CYII="
        with __import__("tempfile").TemporaryDirectory() as temp:
            target = worker.decode_image("data:image/png;base64," + payload, Path(temp) / "page")
            self.assertEqual(target.suffix, ".png")
            self.assertTrue(target.is_file())

    def test_bundle_has_deterministic_metadata_contract(self):
        self.assertEqual(worker.FPS, 24)
        self.assertEqual(worker.MAX_SHOTS, 30)
        self.assertEqual(worker.HOST, "127.0.0.1")

def tiny_png_data_url():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xffffffff)
    header = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    pixels = b"\x00" + b"\xff\x20\x20" * 2 + b"\x00" + b"\x20\xff\x20" * 2
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


class LocalWorkerHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which(worker.FFMPEG) or not shutil.which("ffprobe"):
            raise unittest.SkipTest("FFmpeg/FFprobe unavailable; CI installs these for media integration tests.")
        cls.old_token = worker.TOKEN
        worker.TOKEN = "test-token-not-for-production"
        cls.server = worker.ThreadingHTTPServer(("127.0.0.1", 0), worker.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "server"):
            cls.server.shutdown()
            cls.server.server_close()
            cls.thread.join(timeout=2)
            worker.TOKEN = cls.old_token

    def test_render_requires_token(self):
        request = urllib.request.Request(self.base + "/render", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=5)
        self.assertEqual(caught.exception.code, 401)

    def test_end_to_end_mp4_audio_subtitle_bundle(self):
        payload = {
            "name": "Synthetic test",
            "aspect": "16:9",
            "language": "en",
            "shots": [{
                "title": "Shot 1",
                "dialogue": "Hello test",
                "speaker": "Narrator",
                "duration": 0.5,
                "zoom": 1.02,
                "imageDataUrl": tiny_png_data_url()
            }]
        }
        request = urllib.request.Request(
            self.base + "/render",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer test-token-not-for-production"},
            method="POST"
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers.get_content_type(), "application/zip")
            bundle = zipfile.ZipFile(io.BytesIO(response.read()))
        self.assertEqual(set(bundle.namelist()), {"episode.mp4", "voice-track.wav", "subtitles.srt", "render-manifest.json"})
        manifest = json.loads(bundle.read("render-manifest.json"))
        self.assertEqual(manifest["fps"], 24)
        self.assertEqual(manifest["videoCodec"], "H.264")
        self.assertIn("Hello test", bundle.read("subtitles.srt").decode("utf-8"))
        self.assertGreater(len(bundle.read("episode.mp4")), 1000)
        self.assertGreater(len(bundle.read("voice-track.wav")), 1000)


if __name__ == "__main__":
    unittest.main()
