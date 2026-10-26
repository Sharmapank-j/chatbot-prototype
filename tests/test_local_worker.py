import base64
import importlib.util
import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
