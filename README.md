# Indica Anime Us

**Turn a batch of comic pages into a voiced, subtitled anime-style video — with local-first tools and optional cloud-quality generation.**

> Project transformation is happening on the `indica-anime-us` branch of `chatbot-prototype`; `main` remains untouched.

## Product goal

Upload multiple comic page images or a PDF. Indica Anime Us should automatically:
1. Order pages and detect individual panels.
2. Extract dialogue and narration with OCR; preserve editable original text and reading order.
3. Identify speakers and recurring characters, then build a continuity sheet.
4. Produce an editable, timed storyboard (panel/shot, camera motion, dialogue, voice, subtitles).
5. Create anime-style shot motion with reusable model adapters and character references.
6. Generate Hindi, English, or bilingual dialogue and synchronized subtitles.
7. Assemble shots, audio, music, and captions into MP4 with FFmpeg; export SRT/VTT and project assets.

**Honest offline promise:** The application shell, importing, panel review, editing, subtitle/timeline management, and motion-comic export are designed to work locally. High-quality generative image/video and neural voice models require separately installed model weights and suitable hardware, or an explicitly enabled cloud provider. Strict offline mode must fail closed instead of making network calls.

## Quick start (Windows / laptop)

The repository is being migrated from a chatbot prototype. Until the Indica migration is complete, do not run old chatbot/Supabase instructions from this branch.

Requirements: Windows 10/11, Git, Node.js 20+, Python 3.11+, FFmpeg. Python CV/OCR extras are optional but recommended.

```powershell
git clone --branch indica-anime-us https://github.com/Sharmapank-j/chatbot-prototype.git indica-anime-us
cd indica-anime-us
.\scripts\setup-windows.ps1
```

The setup script is intended to create a Python virtual environment, check tool availability, and prepare local folders without downloading model weights. For the web UI, install npm dependencies and start the Next.js development server using the commands in the setup output.

## Local mode vs AI mode

| Capability | Local/offline base | Optional local model | Cloud provider |
|---|---|---|---|
| Import/reorder comic pages | Yes | — | — |
| Panel detection | OpenCV heuristic; manual corrections | Improved detector if installed | Optional vision adapter |
| OCR | Tesseract if installed; correction UI required | PaddleOCR or compatible local OCR | Optional vision provider |
| Storyboard/timeline/SRT | Yes | Local LLM may assist | Hosted LLM optional |
| Motion-comic export | FFmpeg pan/zoom, cuts, fades | — | — |
| Anime-style image/video generation | Not claimed by base renderer | Depends on VRAM/model | Optional provider adapter |
| Voice | Silent/captioned output works | Local TTS if installed | Optional TTS provider |
| Lip sync / complex character motion | Not guaranteed by base renderer | Model-specific | Optional video/lip-sync provider |

## Reference projects

- [srt-whiteboard-animation](https://github.com/geeklee/srt-whiteboard-animation): inspiration for SRT/timeline-driven scenes, semantic ordering, and a reviewable rendering process. Reuse only ideas; inspect its license before copying code.
- [Open-GenAi-Repo](https://github.com/Sharmapank-j/Open-GenAi-Repo): inspiration for provider adapters, model capability metadata, submit/poll/result handling, local inference options, and reusable media studio patterns.
- [chatbot-prototype](https://github.com/Sharmapank-j/chatbot-prototype): starting codebase. The `main` branch is preserved.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/OFFLINE_MODE.md](docs/OFFLINE_MODE.md), [docs/AGENTS.md](docs/AGENTS.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## Core pipeline

```text
Pages/PDF
  -> page normalization + reading direction
  -> panel detection + manual split/merge/order
  -> OCR + editable dialogue/speaker assignment
  -> character/style bible + story beats
  -> storyboard JSON + editable timeline/SRT
  -> still generation / image-to-video shots (provider adapters)
  -> Hindi/English TTS + optional lip-sync
  -> FFmpeg assembly, subtitles, mix, export
```

## Data, rights, and safety

Only process comic pages you own or are authorized to adapt. Copyright status varies by jurisdiction; uploading a page does not confer adaptation rights. Do not build scraping, paywall bypass, or DRM removal. Do not train on private project assets by default. Secrets belong in untracked environment variables and server-only settings. Local projects should remain in the chosen workspace directory; no silent cloud sync.

## Status

This branch contains the product specification, architecture and implementation plan. A production-grade converter is a multi-stage build; do not label unimplemented AI functions as operational. Follow the roadmap and use acceptance tests for each stage.
