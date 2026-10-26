# Indica Anime Us — prototype guide

## Try the hosted studio

Open the Vercel preview URL attached to the latest deployment, then choose **Open workspace** and create a project. The application is a browser-side prototype: project records and imported image blobs are stored in IndexedDB on the current device/browser profile.

## Working prototype workflow

1. Create a project and give it a name.
2. Import JPG, PNG or WEBP pages. A project supports up to 30 image files and 500 MB total, with a 100 MB per-file limit.
3. Review the shot sequence and edit each shot's title, speaker, dialogue, start time, duration and zoom.
4. Use **Detect panels** to propose panel candidates from prominent white gutters. This is a heuristic, not a trained comic-layout model; inspect its output before continuing.
5. Preview dialogue using the operating system/browser speech engine where available.
6. Export the project manifest, original assets, SRT subtitles, or a rendered motion-comic video.

## Current boundaries

- **PDF page extraction:** not included. Export PDF pages to image files before importing.
- **OCR:** no OCR engine is bundled or connected. Dialogue is editable and can be entered manually.
- **Voice:** browser/system speech synthesis is a preview only. It does not create a persistent voice track or guarantee Hindi voice availability.
- **AI providers:** no provider is connected by default. No cloud inference or API key storage is included in this prototype.
- **Video:** rendering is local in the browser and uses its MediaRecorder implementation. Some browsers can record MP4; others produce WebM. For MP4 on a WebM-only browser, convert locally with FFmpeg:
  ```bash
  ffmpeg -i episode.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart episode.mp4
  ```
- **Persistence:** IndexedDB is local to the browser profile/device. Clearing site data removes local projects. Export backups before switching devices.
- **Testing:** CI checks TypeScript, ESLint and unit tests. Validate the actual hosted deployment and perform a manual import/edit/export smoke test before inviting external testers.

## Privacy and deployment

Source images are processed in the browser and are not uploaded by the import/render controls. The public site can be opened by other people, so users should avoid shared devices for private source material. Do not paste API keys into this prototype. Vercel serves the app; it does not provide shared project storage or a server-side rendering queue for this workflow.
