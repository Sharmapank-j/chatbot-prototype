# Offline and laptop operation

## Contract

Strict offline mode makes zero external HTTP/API calls. It is not synonymous with “some models run locally”: the app must show the actual installed engine/model capabilities and degrade gracefully.

## Base local workflow

- Import pages/PDF and keep all originals under a user-selected workspace.
- Detect candidate panel borders using OpenCV heuristics and allow manual correction.
- Run OCR only if an OCR engine is installed; display unsupported-language and low-confidence warnings.
- Edit dialogue, speaker, translation, timing and subtitle text.
- Generate motion-comic video using local FFmpeg: static panels with pan/zoom, fade/cut transitions and subtitle tracks.
- Export MP4, SRT/VTT and JSON project manifest.
- All intermediate artefacts are inspectable and can be deleted via explicit cleanup.

## Optional local engines

- OCR: Tesseract (include/verify Hindi language data separately) or PaddleOCR if the installed build supports Hindi and required dependencies.
- LLM: Ollama or another OpenAI-compatible localhost endpoint. In strict offline mode, allow loopback only; block public endpoints.
- Image generation: local ComfyUI-compatible endpoint or local inference runner only when the model fits available VRAM/RAM.
- Video: local workflow/engine with explicit compatible-model capability declaration; don't claim desktop RTX 3050 can run every current video model.
- TTS: installed local Hindi/English voice engine and corresponding voice models. Check language coverage before selecting.
- Rendering: FFmpeg/ffprobe.

## Laptop profile

Use CPU for ingestion, project editing and low-resolution motion-comic rendering. Use the NVIDIA GPU only for supported models. Provide presets: Draft 720p, Final 1080p, portrait 1080x1920. Avoid auto-downloading multi-gigabyte model weights at setup. Model downloads require explicit opt-in and licence review.

## First-run preflight

Report OS, Python, Node, FFmpeg, OCR languages, available GPU/VRAM, configured localhost endpoints and disk-space estimate. Redact paths when sending telemetry; default telemetry off.

## Security

- API providers disabled by default.
- Strict offline mode rejects non-loopback provider URLs.
- Prevent arbitrary URLs in image/movie inputs to avoid SSRF.
- Use allowlisted local paths; guard path traversal and archive bombs.
- Never execute code/config parsed from a comic.
- Keep secrets only in ignored local env files / OS credential storage.
