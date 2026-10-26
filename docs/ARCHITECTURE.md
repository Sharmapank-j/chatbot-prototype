# Architecture

## Design principles

- Local-first: local files, local workspace, optional models/providers.
- Offline means no external network requests. Provider adapters are disabled unless explicitly configured.
- Deterministic operations (splitting, timeline, muxing) are separate from probabilistic model operations.
- Every stage stores inspectable artifacts and can be retried independently.
- Human-editable checkpoints prevent OCR, speaker, and translation errors from being baked into a final video.
- Model providers are swappable; keep vendor SDK details out of domain code.

## Proposed module boundaries

```text
app/                     Next.js UI, project workspace and route handlers
components/              UI primitives and editors
lib/indica/
  domain/                Project, page, panel, character, dialogue, shot schemas
  pipeline/              Orchestrator, status transitions, retry/cancel, run manifests
  panels/                Image normalization, panel detection, crops, reading order
  ocr/                   OCR interfaces + Tesseract/PaddleOCR implementations
  dialogue/              Speaker assignment, translation and script editing
  storyboard/             Story beats, shot breakdown, motion instructions
  timeline/              Timed shots, subtitle track, SRT/VTT parse/serialize
  providers/
    image/                Image generation/edit adapters
    video/                Image-to-video/text-to-video adapters
    tts/                  Hindi/English speech adapters
    lipsync/              Optional lip-sync adapters
    llm/                  Local and cloud model adapters
  render/                 FFmpeg graph, audio mix, subtitle burn-in/mux
scripts/indica_local_worker.py  Loopback FFmpeg/Piper worker; no media processing in Vercel functions
agents/orchestrator.yaml        Declarative stage dependencies, approvals and failure policy
  storage/                Workspace files and metadata; no implicit cloud
worker/                   Long tasks moved out of HTTP request lifecycle
scripts/                  Windows bootstrap, preflight, render helpers
docs/                     Setup, architecture, pipeline, troubleshooting
```

Keep the Next.js application for user experience and APIs; run heavy OCR, CV, generation, and rendering in a Python worker/CLI so long jobs do not block server requests. Persist project metadata behind a project-owned storage interface; local mode should not require a hosted database. Store binary outputs on disk for local mode; configure cloud object storage only in a separate optional deployment profile.

## Data contracts

- **Project**: id, name, workspace path, source manifest, preferred reading direction (LTR/RTL/vertical), default language, output profile, timestamps.
- **Page**: id, order, source file, normalized dimensions, checksum, OCR status.
- **Panel**: id, page id, reading order, bounding box, crop path, confidence, manual override, OCR blocks.
- **Character**: stable id, display name, appearance description, voice profile, reference images, continuity notes.
- **DialogueLine**: id, panel id, speaker id, original text, translated variants, language/script, voice settings, start/end timestamps, reviewer status.
- **Shot**: id, panel/beat references, character refs, prompt, camera movement, duration, aspect ratio, generation provider/job id, output artifact, review state.
- **PipelineRun**: stage, input/output manifest hashes, provider, configuration snapshot, status, retries, errors, elapsed time, estimated cost where applicable.
- **Artifact**: path/URI, MIME type, size, hash, source stage, license/rights metadata, retention status.

All model output is untrusted input. Validate JSON against schemas and keep prompt/content injection inside assets from becoming executable instructions.

## Pipeline stages and gates

1. **Ingest** — batch JPG/JPEG/PNG/WEBP and PDF; validate file types, page count and pixel limits; normalize orientation and color space.
2. **Panel extraction** — adaptive threshold/contour detector as a fast fallback; optional learned detector. Keep detected boxes and confidence visible; allow split, merge, reorder, exclude, and manual crop. Never presume left-to-right for manga; user chooses direction.
3. **OCR** — local OCR engine availability check. Return text + bounding boxes + confidence; low-confidence lines go to review. Hindi/Devanagari support is engine-specific and must be checked. Preserve original balloon text if redrawing is unsupported.
4. **Dialogue and language** — correct OCR, assign speakers, translate only when requested, preserve idioms and character voice. Support Hindi Devanagari, Hinglish, and English. Translation, dub script, and subtitle text are distinct fields.
5. **Character and style bible** — extract visual traits and reference crops, define stable identifiers, costume/age/face/colour continuity. Do not promise perfect identity consistency; show references per shot.
6. **Storyboard** — turn panel sequence into timed shots with beat, framing, motion, SFX/music cue, dialogue, subtitle timing and review status. SRT-inspired timeline is canonical editable timing format, not the internal source of truth by itself.
7. **Anime visuals** — local generation adapter first if installed; cloud image-to-video adapter only after user enables provider, confirms estimated cost and accepts outbound media transfer. Generate key stills before motion where useful. Include retries, content-safe error states and provenance.
8. **Voices** — assign voice presets per character; generate Hindi/English independently; allow user-recorded audio; no voice cloning by default. Voice cloning only with explicit, documented permission and suitable policy.
9. **Lip-sync (optional)** — separate from TTS and video generation. Must be selectable per shot and not a hard dependency for export.
10. **Local media worker** — binds to 127.0.0.1, requires a per-run bearer token, runs FFmpeg and optional Piper locally, and exports a ZIP containing MP4, synchronized WAV, SRT and render manifest. Vercel hosts the UI only.
10. **Render** — create shot clips, normalize dimensions/FPS/audio sample rate, concatenate or transition, mix dialogue/music/SFX, generate soft/burned subtitles, mux MP4, export SRT/VTT and render manifest.
11. **Quality checks** — missing frame/audio, subtitle clipping, silence, loudness peak, shot duration, missing assets, broken character refs, watermarks/unsupported output formats.
12. **Export** — H.264 MP4 + AAC baseline, 16:9 and 9:16 profiles, 24/30 FPS presets, SRT/VTT, editable project manifest.

## Provider adapter contract

Each adapter advertises: id, display name, capability list, local/cloud flag, supported input types, language support, max image/video durations/resolution, cost-estimate capability, cancellation/polling support, and whether media leaves the device.

Adapter methods should normalize submit -> poll/status -> result/error -> cancel, with bounded retries and idempotency keys. Keep keys server-side; never embed them in client bundles or committed example files.

## Reliability

- Use resumable stage checkpoints and content hashes to avoid repeating expensive work.
- Never delete sources when a stage is rerun.
- Cache model capability checks, not secrets.
- Give each job a stable ID and status transitions: queued, running, needs_review, succeeded, failed, cancelled.
- Keep per-stage logs redacted; do not log prompts with private comic text unless the user opts in.
- Provide disk-usage indicators, cleanup previews, and explicit removal.
