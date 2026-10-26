# Agent Instructions

You are working on Indica Anime Us, not the original Chatbot UI product. Follow this document when using Claude Code, OpenCode, Codex, Copilot or any other coding agent.

## Before edits
1. Read README, architecture, roadmap, offline contract, contributing guide and current licence.
2. Inventory current code; classify reusable UI/auth/LLM infrastructure vs chatbot-only routes/schema.
3. Review licences of reference projects before copying any source code.
4. Define an end-to-end vertical slice with tests before broad refactors.
5. Never assert a feature is working unless implementation and tests prove it.

## Guardrails
- Keep `main` untouched; work on `indica-anime-us`.
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
- Motion-comic MP4 can render without cloud APIs or AI weights.
- Strict offline mode blocks non-loopback providers.
- Tests cover invalid files, path traversal, malformed subtitles, pipeline retries and missing binaries.

## Coding style
Use typed domain schemas and narrow modules. Avoid unneeded dependency upgrades. Keep secrets out of browser bundles. Add licences for new dependencies and model weights. Keep fixtures synthetic or licensed.
