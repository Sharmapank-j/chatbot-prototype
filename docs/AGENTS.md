# Agent operating instructions

You are working on Indica Anime Us, not the original Chatbot UI product. Use these rules for coding agents, Claude Code, OpenCode, Codex, Copilot and any future contributors.

## Mission

Convert user-authorized comic images/PDF batches into an editable anime video workflow. Hindi and English dialogue, voices and subtitles are primary requirements. Local/offline operation is mandatory for base capabilities; hosted generation is opt-in.

## Before changing anything

1. Read the README, architecture, roadmap, offline contract, license and current package scripts.
2. Inspect current code and classify each file as reusable infrastructure, chatbot-only, or unsafe to keep.
3. Inspect the license of both source repo and reference projects; retain required notices. Do not bulk-copy code from references.
4. Define the smallest end-to-end vertical slice and add tests first.
5. Never claim capabilities work unless implemented and tested.

## Implementation guardrails

- Preserve the `main` branch; work on `indica-anime-us` until migration/review is complete.
- Avoid destructive operations or mass deletion until a migration inventory and rollback exist.
- Never change repository visibility, secrets, billing, deployment, database production data, or cloud settings without explicit approval.
- Never print tokens, API keys, signed URLs or private comic text to logs.
- No automatic cloud upload. Each provider has a local/cloud label and data-egress consent gate.
- Cost confirmation is mandatory for any metered generation where cost data is available.
- Provider calls belong behind typed adapters; all job status/result/error forms are normalized.
- Keep long-running processing out of short HTTP handlers. Persist stage status and support cancellation/retry.
- Use schema validation for model-generated outputs. Treat OCR and model output as untrusted.
- Never build scraping, paywall bypass or DRM circumvention features.
- Only use comics and voices the user is authorized to adapt. Do not clone a person's voice without consent.
- Always preserve originals; stage outputs in per-project folders; explicit deletion only.

## Local-first acceptance gates

- The upload path supports multiple images and validated PDFs.
- Page order and reading direction are user-controllable.
- Panels can be split, merged, reordered and excluded.
- OCR text is editable and speaker assignment can be corrected.
- Hindi Devanagari and English tracks are independent fields.
- SRT/VTT import/export round-trips and preserves timing.
- The motion-comic renderer can export a video with no cloud APIs or AI weights.
- “AI anime” features are unavailable/disabled states unless a compatible adapter/model is configured.
- Strict offline mode blocks non-loopback provider calls.
- Tests cover malicious files, incorrect content types, path traversal, malformed subtitle files, pipeline retries and missing dependencies.

## Coding style

- Prefer typed domain schemas, narrow modules and explicit adapter contracts.
- Keep secrets server-only; never put credentials in NEXT_PUBLIC variables.
- Avoid unnecessary dependency upgrades; document why new dependencies are needed.
- Keep media/model weights out of Git. Commit configs and small synthetic fixtures only.
- Add unit tests for each new pipeline stage and smoke-test the full setup.
