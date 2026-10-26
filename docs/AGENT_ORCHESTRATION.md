# Agent orchestration contract

## Purpose
Coordinate a deterministic, local-first comic-to-anime production pipeline. Agents may analyze and propose edits; only validated, user-approved artifacts enter the project state. OCR text, comics, prompts, model responses and filenames are untrusted input.

## Roles and contracts

| Agent | Input | Output contract | Must not do |
|---|---|---|---|
| Intake / Validation | Files, MIME, size, project manifest | Validated asset inventory and stable asset IDs | Execute embedded scripts, trust file extensions alone, overwrite originals |
| Page / Panel Vision | Image blobs, reading direction | Normalized panel rectangles, confidence, reading order, source coordinates | Claim heuristic detections are ground truth |
| OCR / Dialogue | Cropped panel, language selection | Text spans, boxes, confidence, source asset/panel IDs | Silently replace edited dialogue or invent illegible text |
| Story / Continuity | Ordered panels, approved dialogue, character notes | Scene graph, continuity warnings, proposed shot list | Change story canon without user approval |
| Prompt / Generation | Approved shot spec, provider capability descriptor | Prompt, negative prompt, provider/job metadata | Call an unconfigured provider or imply output exists before it does |
| TTS / Audio | Approved dialogue, voice ID, locale, shot timing | WAV per line/shot, sample rate, duration, timing metadata | Clone a voice without authorization or silently truncate speech |
| Render / Export | Validated timeline, media, subtitle/audio tracks | MP4, WAV, SRT, manifest, checksums and tool versions | Claim reproducibility without recording render settings |
| QA / Verifier | Manifest, output files, logs, acceptance gates | Pass/fail report with concrete evidence | Mark a stage passed when it was skipped or only mocked |

## Orchestrator state machine

draft -> validating -> analyzed -> awaiting_review -> approved -> generating -> rendering -> verifying -> complete

Any stage may transition to failed; retryable failures may transition to retry_wait and then the previous stage. Cancellation must stop child processes and preserve completed artifacts. A retry must reuse immutable inputs and an idempotency key; it must not duplicate exports.

## Execution rules

1. Keep the source project and original assets immutable. Every derived artifact records input IDs and a content hash.
2. Run CPU/GPU/media-heavy work in the local worker or CLI, not inside a short Vercel request.
3. Use typed schemas at every agent boundary. Reject malformed JSON, invalid coordinates, unsupported provider capabilities, and timing outside project limits.
4. Keep OCR, vision, translation, story, TTS and render outputs separate so a user can rerun one stage without losing edits from another.
5. Provider routing is explicit per task: local-first by default; cloud inference requires user configuration and visible media-egress consent. Secrets are never part of project manifests, logs, prompts or agent outputs.
6. Bound concurrency, file sizes, timeouts, retries and cost. Retry only transient network/process errors, with at most 2 retries and exponential backoff; do not retry validation errors.
7. Preserve provenance: provider/model/version, prompt/template version, seed when supported, FFmpeg version, codec, fps, dimensions, voice model ID, source hashes and output hashes.
8. A human approves extracted dialogue, story changes, voice choice and generated assets before final render.
9. Verification uses real artifacts where possible. A mocked provider or fake media binary only proves the adapter contract, not output quality.
10. No stage may claim end-to-end success unless import, edit, persistence/restore, rendering, audio/subtitle synchronization and output inspection all pass.

## Failure envelope
Each stage returns status, stage, artifact IDs, warnings, error code, retryable flag, start time and finish time. User-facing errors must identify the failed stage and a corrective action. Never expose API keys, raw authorization headers, or full private filesystem paths.

## Required tests
- Invalid/corrupt/oversized asset and bundle rejection.
- OCR/PDF loader failure and unsupported language reporting.
- Provider DNS/private-address and redirect rejection.
- Retry/cancel idempotency and immutable source hashes.
- Local worker token rejection, missing FFmpeg/Piper, malformed payload and timeout.
- Export MP4 codec/fps/duration, audio sample rate/duration, subtitle timestamps and manifest.
- Browser workflow: import -> edit -> reload -> restore backup -> render/export -> verify files.
