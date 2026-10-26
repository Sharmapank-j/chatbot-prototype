# Roadmap and acceptance gates

## P0 — Make branch safe and coherent

- Replace product name, metadata, landing and navigation.
- Inventory chatbot-specific pages/API/auth/database dependencies before removal.
- Ensure no legacy chatbot routes remain accessible in the Indica workspace.
- Record license attribution and preserve untouched `main`.
- Run install, typecheck, lint, tests and build after meaningful edits.

## P1 — Offline local motion-comic MVP

- Project creation and folder-backed workspace.
- Import pages as images and PDF (input validation, size limits, page order).
- Preview pages and hand-adjust reading direction.
- Panel detection with manual split/merge, reorder and exclude.
- OCR adapter and editable dialogue transcript with confidence markers.
- Character/speaker list and editable dialogue lines.
- Shot/timeline editor with pan, zoom, fade and cut.
- Import/export SRT and VTT.
- Local TTS integration only when voice engine and model are installed.
- FFmpeg MP4 rendering with subtitles and optional audio track.
- Offline preflight screen that shows exactly which capabilities are available.

**P1 is complete when:** a user can add a small set of comic pages, correct panels/dialogue, create a timed motion-comic, and export a playable MP4 without internet access after installing dependencies/assets.

## P2 — AI-assisted story preparation

- OCR correction suggestions, speaker extraction, scene/beat summaries.
- Translation Hindi <-> English; preserve source text.
- Story bible and character/reference board per project.
- Provider and model capability registry.
- Prompt templates and reusable generation settings.
- Review gates before running paid generation.

## P3 — Anime shot creation

- Generate keyframe stills for each shot.
- Character and style references attached consistently to every compatible call.
- Local image-generation adapters based on available VRAM/model compatibility.
- Optional image-to-video providers with cost estimate, submit/poll, cancellation, retry and output validation.
- Shot review, regenerate and compare alternatives.
- Explicit warning: generated motion may alter facial details or panel continuity.

## P4 — Dialogue, dubbing and sound

- Hindi (Devanagari) and English tracks; Hinglish optional.
- Per-character voices, timing and pronunciation overrides.
- Audio segmentation and silence trimming.
- Optional lip-sync provider.
- Music/SFX library with per-track gain, ducking, fades, and license metadata.
- Subtitle burn-in or soft subtitles.

## P5 — Usability, performance, release

- Installable Windows package and guided first-run setup.
- Queue limits, resumable jobs, logs, automatic disk-space warnings.
- Job-level costs/outbound-data indicators for cloud mode.
- Accessibility, keyboard controls and mobile project review.
- Playwright smoke tests; Python unit tests; sample licensed pages and golden render.
- SBOM/dependency audit, secret scanning, security review, license notices and release checklist.

## Definition of done

No fake AI: buttons reflect actual available capabilities. The offline core must work when outbound networking is blocked after setup. Cloud mode must display provider/model, media-egress notice, and cost when supported. Project data is private by default and deletions are explicit.
