# Indica Anime Us — Root Agent Guide

The detailed mandatory rules are in `docs/AGENTS.md`. Read README, architecture, roadmap, offline contract, contributing guide, and existing licence before editing. Work on the product branch and avoid broad changes to unrelated branches. Audit authentication, API handlers, persistence, and data models before replacing any shared infrastructure.

Target: local-first comic batch -> panel extraction -> OCR/dialogue -> character/style continuity -> storyboard/timeline -> anime shots -> Hindi/English voices and subtitles -> FFmpeg MP4 export.

Panel extraction, editing, subtitles, and motion-comic rendering must work locally after setup. Do not claim generative anime/video or TTS works unless a compatible model/provider is configured. All network calls are blocked in strict offline mode; cloud uploads need explicit per-job consent.
