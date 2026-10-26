# Indica Anime Us — prototype guide

## Hosted dashboard

Open the Vercel preview for the latest successful deployment, then open the workspace. Project records and source blobs are stored in IndexedDB in the current browser profile. The hosted site does not install or run FFmpeg or Piper on the laptop by itself.

## Import, edit, analyze

1. Create a project and import JPG, PNG, WEBP, PDF or supported video files. Video/PDF processing creates browser-side page/frame images. Batch limits apply.
2. Review shot order and edit shot title, speaker, dialogue, start, duration, zoom and crop.
3. Use Rectify pages, Detect panels and Run OCR. PDF.js rasterizes up to 30 pages per import operation; Tesseract.js runs English or Hindi+English OCR. Engines/language data load on demand from public CDNs, so the first run requires network access. Verify every OCR result.
4. Optionally open AI and choose Hosted API or Local GGUF. Hosted vision/image generation uses the configured OpenAI-compatible HTTPS endpoint; local llama.cpp is text-only and sends prompts through the loopback worker. Analyze a selected panel, generate a scene plan, apply extracted dialogue or submit an image-generation prompt. Cloud inference sends the selected image/prompt to that provider.
5. Export a portable .indica.json bundle with source assets; restore a bundle on another device. Corrupt data, unsupported bundle versions, invalid asset references, size mismatches and invalid crop coordinates are rejected.

## Deterministic local rendering and speech

Vercel hosts the UI; media rendering runs in a separate local worker because serverless requests are not a reliable FFmpeg job queue.

1. Install FFmpeg (including FFprobe) and make both commands available on PATH.
2. For speech, install Piper and download a compatible ONNX voice model yourself. Do not auto-download multi-GB weights. Voice licenses and language support vary by model.
3. In a terminal from the repository root, configure Piper in PowerShell and start the worker:

   ```powershell
   $env:INDICA_PIPER_MODEL = "C:\\models\\en_US-voice-medium.onnx"
   # Optional separate voice models for Hindi and English projects:
   $env:INDICA_PIPER_MODEL_EN = "C:\\models\\en_US-voice-medium.onnx"
   $env:INDICA_PIPER_MODEL_HI = "C:\\models\\hi_IN-voice-medium.onnx"
   # If Piper is not on PATH, set its full executable path:
   # $env:INDICA_PIPER_BIN = "C:\\tools\\piper\\piper.exe"
   python scripts/indica_local_worker.py
   ```

4. The worker binds to 127.0.0.1:8765 and prints a random bearer token. Keep the terminal open. In the studio Export tab, click Check local worker, paste the token, and choose Render MP4 + audio bundle.
5. The worker creates deterministic 24 fps H.264 video with AAC audio, a separate voice-track.wav, subtitles.srt and render-manifest.json in a ZIP. If Piper is not configured, the audio track is silence and the manifest says so. The render currently supports up to 30 shots per job and a maximum 180 MB JSON request.
6. The worker is loopback-only and requires the token. The token is held in page memory and is not included in project backups. Do not expose the worker port to your LAN or internet.

## Local llama.cpp and GGUF provider

The AI tab has a Local GGUF mode. It talks to the local worker at 127.0.0.1; the selected model itself is not uploaded to Vercel or the hosted provider relay.

1. Install a build of llama.cpp that includes `llama-server`, and ensure `llama-server` is available on PATH.
2. Start `python scripts/indica_local_worker.py` from the repository root. Keep it bound to loopback. Copy the one-run worker token printed by the process into the AI tab.
3. In the AI tab, select Local GGUF, enter the absolute path to an existing `.gguf` file on the same computer, choose context size/GPU layers, then select Load GGUF model. Browsers intentionally do not expose local filesystem paths through ordinary file picker APIs; the path is typed explicitly, and only that path is sent to the local worker.
4. Use Generate scene plan locally. The current llama.cpp adapter handles text generation. It does not infer images, generate images, or perform video generation. For vision analysis, select a hosted vision model; image bytes are sent to that configured provider only when you explicitly invoke vision analysis.
5. Loading a large GGUF can take several minutes and consumes system RAM/VRAM. Start with a quantized model that fits the computer. Unload the model when finished to release its process resources.
6. Local GGUF chat requests are authenticated with the random worker token, limited in prompt/context length, and sent over loopback to llama.cpp. Do not expose the worker or llama.cpp port to the network.

## Current boundaries

- OCR and PDF extraction are real browser engines, but depend on CDN availability unless their assets are self-hosted. Panel detection remains a contour heuristic; it is not a trained comic understanding model.
- Local TTS requires an installed Piper executable and compatible ONNX voice model. Configure INDICA_PIPER_MODEL as a fallback, or INDICA_PIPER_MODEL_EN and INDICA_PIPER_MODEL_HI for separate project-language voices. Model licensing and quality must be verified by the user.
- FFmpeg rendering is implemented in the local worker. It is deterministic for the same inputs, tool versions and settings, but byte-for-byte identical output across different FFmpeg builds/platforms is not guaranteed.
- The hosted vision route supports OpenAI-compatible chat-completions image_url payloads and the compatible Images API. It rejects IP-literal/private or unresolved provider hosts and disallows redirects. DNS and provider policies can still change; use a restricted API key and review media-egress consent.
- IndexedDB is local to the browser profile/device. Export backups before clearing site data or switching devices.
- CI runs TypeScript, ESLint, Jest, Python worker tests, a real FFmpeg render integration test, production build and Playwright browser test for import/edit/reload/backup/restore. These checks do not replace manual visual/audio inspection of the deployed site and a configured Piper voice.
- The local worker currently exports a full-project render bundle, not a resumable render queue. Cloud generation of complete video shots and lip-sync are separate provider integrations.

## Privacy and deployment

Imported source pages stay in browser storage for local import/edit/export. If AI vision/generation is used, the selected image or prompt is sent through the app API to the configured provider. API keys are not saved in IndexedDB/localStorage, but transit the app server for the request. The local worker binds to loopback, authenticates render requests with a random token, and returns the output ZIP directly. Avoid shared computers for private source material.
