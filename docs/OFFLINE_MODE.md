# Offline and laptop mode

## Contract
Strict offline mode makes zero external HTTP/API calls. It does not imply all AI models run locally. The UI must show which engines, model weights, OCR languages, TTS voices and GPU features are actually available.

## Base local workflow
- Import and order page images/PDF; preserve originals.
- OpenCV heuristics create panel candidates; user can correct them.
- OCR runs only if an engine is installed; show unsupported-language and low-confidence warnings.
- Edit dialogue, speakers, translations, shot timing and subtitles.
- Use FFmpeg for local pan/zoom motion-comic, fades/cuts and MP4 export.
- Export SRT/VTT and a JSON project manifest.
- Store files in a selected local workspace and manage cache explicitly.

## Optional local models
- OCR: Tesseract with appropriate language data or PaddleOCR build validated for the required script.
- LLM: Ollama or compatible localhost model; strict mode permits loopback only.
- Image generation: local ComfyUI-compatible endpoint or inference engine only when model/hardware are supported.
- Video generation: a compatible local workflow; never promise it fits every laptop.
- TTS: an installed local engine with Hindi/English voice models.
- FFmpeg/ffprobe: local media operations.

## Laptop profile
CPU handles ingest, panel editing, subtitles and draft rendering. Use GPU only for model/hardware pairs verified by preflight. Provide Draft 720p, 1080p final and portrait 1080x1920 presets. Do not auto-download multi-GB model weights.

## First-run preflight
Check OS, Node, Python, FFmpeg, OCR engines/languages, available GPU/VRAM, local endpoints and disk space. Telemetry off by default; redact paths and file names.

## Security
- Cloud providers disabled by default.
- Offline mode rejects non-loopback provider URLs.
- Do not fetch arbitrary URLs as media inputs; prevent SSRF.
- Use allowlisted workspace paths and protect against path traversal/archive bombs.
- Treat OCR and model outputs as untrusted data.
- Keep secrets in ignored local env or OS credential storage.
