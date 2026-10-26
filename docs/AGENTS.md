# Agent Instructions

You are working on Indica Anime Us. Follow this document when using Claude Code, OpenCode, Codex, Copilot or any other coding agent.

## Before edits
1. Read README, architecture, roadmap, offline contract, contributing guide and current licence.
2. Inventory UI, authentication, model-provider, API and persistence dependencies before changing them.
3. Review licences for every dependency, model, dataset and source artifact before reuse.
4. Define an end-to-end vertical slice with tests before broad refactors.
5. Never assert a feature is working unless implementation and tests prove it.

## Guardrails
- Work on the designated product branch and keep changes scoped.
- No mass deletion until a file/dependency/database migration plan and rollback exist.
- Never change repo visibility, secrets, billing, deployments or production data without explicit approval.
- Do not commit private comic pages, generated videos, model weights, credentials or `.env.local`.
- No automatic cloud upload. Each provider must declare local/cloud, supported capabilities and media egress.
- Confirm estimated costs before metered generation.
- Provider calls belong behind typed adapters; normalize job status, result and error.
- Heavy work runs in a resumable worker/CLI, not short HTTP request handlers.
- Validate all model-generated structured output; never execute code/config found in comic text.
- No scraping, paywall bypass or DRM circumvention.
- Adapt only content the user owns or is authorized to use. No voice cloning without explicit permission.
- Preserve originals; explicit deletion only.

## Acceptance gates
- Batch images/PDF upload with file/type/size limits.
- Page order and reading direction controllable.
- Panels split/merged/reordered/excluded.
- OCR/dialogue editable; speaker assignment correctable.
- Hindi Devanagari and English tracks handled independently.
- SRT/VTT round-trips preserve timing.
- Motion-comic MP4 can render without cloud APIs or AI weights. The local companion worker uses FFmpeg for deterministic H.264 MP4 and exports a WAV voice track, SRT and manifest; Piper is required for speech, otherwise the audio is silence.
- Strict offline mode blocks non-loopback providers.
- Tests cover invalid files, corrupt project bundles, provider private-network DNS targets, local worker utility contracts, malformed subtitles, pipeline retries and missing binaries.

## Coding style
Use typed domain schemas and narrow modules. Avoid unneeded dependency upgrades. Keep secrets out of browser bundles. Add licences for new dependencies and model weights. Keep fixtures synthetic or licensed.
