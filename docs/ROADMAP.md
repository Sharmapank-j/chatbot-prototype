# Roadmap

## P0 — Branch migration and safety
- Replace product identity and chatbot copy/routes in this branch only.
- Inventory chatbot auth/database/API dependencies before removal.
- Retain required upstream licence notices and audit all references' licences.
- Add Windows preflight and ensure no secrets are committed.
- Run typecheck, lint, tests and build after each migration step.

## P1 — Offline motion-comic vertical slice
- Folder-backed projects; import multiple images and PDFs.
- Page preview, ordering, reading-direction control.
- Panel detection with manual split/merge/reorder/exclude.
- OCR adapter with editable transcript and confidence indicators.
- Speaker list and dialogue editor.
- Shot timeline with cut, fade, pan and zoom.
- SRT/VTT import/export.
- Local TTS only where an installed voice engine/model exists.
- FFmpeg MP4 rendering with optional local audio and subtitles.
- First-run capability preflight, no model downloads without explicit consent.

**Acceptance:** with outbound networking blocked after setup, user imports comic pages, corrects panel order/text, builds a timed motion-comic and exports a playable MP4.

## P2 — AI-assisted script
- Story beats, speaker hints, translation Hindi <-> English, continuity bible.
- Model capability registry and prompt templates.
- Local LLM integration through explicit localhost endpoints.
- Review and cost/data-egress gates before generation.

## P3 — Anime shots
- Generate keyframe stills per shot.
- Reuse character/style references.
- Add local image generation adapters where available/VRAM-compatible.
- Add optional image-to-video adapters with cost estimate, submit/poll/cancel/retry, and result validation.
- Review/compare/regenerate each shot. Explicitly warn about identity drift and motion artifacts.

## P4 — Voice and sound
- Hindi Devanagari and English dialogue tracks; Hinglish optional.
- Voice presets per character, speed/pitch/pronunciation overrides.
- Audio segmentation, silence trim and mixing.
- Optional licensed music/SFX library and ducking.
- Optional lip-sync integration.

## P5 — Packaging and quality
- Windows setup wizard and troubleshooting.
- Resume jobs, queue concurrency limits, structured redacted logs.
- Disk-space and cache controls.
- Tests for malicious uploads, path traversal, subtitle parsing, retries and missing binaries.
- Playwright workflow tests, Python unit tests and a licensed sample project.
- Dependency/licence audit, secret scan, SBOM and release checklist.

## Definition of done
No fake AI: UI availability matches actual engines. Offline core works with network blocked. Cloud actions show provider, model and outbound-data consent, and cost where supported. Data is private by default; deletion is explicit.
