# Indica Anime Us

**A local-first comic-to-anime production studio with editable storyboard, OCR, optional vision providers, local TTS and deterministic FFmpeg export.**

## Current workflow

1. Import comic page images, PDFs or supported videos.
2. Extract PDF pages/video frames, detect panel candidates, and run English or Hindi+English OCR.
3. Review panels and edit dialogue, speakers, shot order, crop and timing.
4. Optionally connect an OpenAI-compatible vision LLM or image-generation endpoint. Cloud calls require a user-configured endpoint/key.
5. Export a portable project bundle, SRT subtitles, or render through the local FFmpeg/Piper worker.
6. The local render bundle includes H.264 MP4, a synchronized WAV voice track, SRT subtitles and a render manifest.

## Architecture boundary

The Vercel deployment hosts the web dashboard and optional AI-provider relay. It does not install FFmpeg or voice models on the user's laptop. Deterministic media work runs in scripts/indica_local_worker.py on loopback. FFmpeg and FFprobe are required for video export; Piper plus an installed ONNX voice model is required for speech. Without Piper, the worker intentionally emits a silent audio track and records that fact in the manifest.

OCR and PDF extraction use Tesseract.js and PDF.js loaded on demand in the browser. First use requires the configured CDN assets to be reachable. Panel detection is a heuristic and requires review.

## Quick start

Requirements: Windows 10/11 or a compatible desktop OS, Git, Node.js 20+, Python 3.11+, FFmpeg and FFprobe.

```powershell
git clone --branch indica-anime-us <repository-url> indica-anime-us
cd indica-anime-us
npm ci
npm run dev
```

In another terminal, configure an optional Piper model and start the local media worker:

```powershell
$env:INDICA_PIPER_MODEL = "C:\models\en_US-voice-medium.onnx"
python scripts/indica_local_worker.py
```

The worker prints a random token. Open the studio Export tab, check the local worker, paste the token and choose Render MP4 + audio bundle. See the prototype guide for configuration and limits. Do not expose the local worker port outside loopback.

## Test commands

```bash
npm run type-check
npm run lint
npm test -- --runInBand
npm run test:worker
npm run build
```

The Python worker test suite includes an actual synthetic FFmpeg render when FFmpeg/FFprobe are installed. CI installs these tools and runs the suite. This is not a substitute for manually checking a real comic, a configured Piper voice, the deployed UI and audio/subtitle synchronization.

## Local GGUF provider (llama.cpp)

The AI dashboard supports a local text-generation provider through the companion worker. Install `llama-server` from llama.cpp, start `python scripts/indica_local_worker.py`, paste its one-run token into the AI tab, choose Local GGUF, and enter the absolute path of a local `.gguf` model. The model bytes are never uploaded. Browsers generally do not disclose file system paths from a file picker, so the path is entered explicitly. The adapter currently supports text/scene-plan generation only; it is not a vision or image-generation runtime.

## Product boundaries

| Capability | Current status |
|---|---|
| PDF page extraction | Browser PDF.js; max 30 pages per operation |
| OCR | Tesseract.js; verify all text manually |
| Panel detection | OpenCV contour heuristic |
| Project backup/restore | Versioned portable JSON with embedded source assets and validation |
| Vision LLM / image generation | Optional OpenAI-compatible endpoint; model capabilities vary |
| MP4 rendering | Local FFmpeg worker; H.264 at 24 fps |
| Local TTS | Piper ONNX model when installed/configured |
| Voice audio and subtitles | WAV, SRT and embedded MP4 subtitle track in render bundle |
| Generative anime/video shots and lip-sync | Separate provider/model integration; not claimed by the base renderer |

## Agent orchestration

Read docs/AGENT_ORCHESTRATION.md, agents/orchestrator.yaml, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/OFFLINE_MODE.md, and docs/AGENTS.md.

## Rights and safety

Only process comic pages you own or are authorized to adapt. Do not commit private source pages, API keys, model weights or generated media. Provider keys are never written to project backups. Review voice-model licensing and obtain permission before any voice cloning. Strict offline mode must fail closed instead of silently calling cloud APIs.
