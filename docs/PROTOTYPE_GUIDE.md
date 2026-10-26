# Indica Anime Us — prototype guide

## Try the hosted studio

Open the Vercel preview URL attached to the latest deployment, then choose **Open workspace** and create a project. The application is a browser-side prototype: project records and imported image blobs are stored in IndexedDB on the current device/browser profile.

## Working prototype workflow

1. Create a project and give it a name.
2. Import JPG, PNG or WEBP pages. A project supports up to 30 image files and 500 MB total, with a 100 MB per-file limit.
3. Review the shot sequence and edit each shot's title, speaker, dialogue, start time, duration and zoom.
4. Use **Rectify pages**, **Detect panels**, and **Run OCR**. OpenCV.js detects page/panel candidates, PDF.js rasterizes PDF pages, and Tesseract.js performs on-demand OCR. Review every crop and recognized line. These browser engines are downloaded from public CDNs when first used.
5. Optionally open **AI** and provide an OpenAI-compatible HTTPS endpoint, vision-capable model and API key. Use **Analyze selected panel** for visual analysis, **Generate scene plan** for shot prompts, or **Generate image** if the endpoint implements the OpenAI Images API. The key stays in page memory and is sent to the app's server route only for the request; it is not written to IndexedDB/localStorage.
6. Preview dialogue using the operating system/browser speech engine where available.
7. Export a portable `.indica.json` project bundle with embedded source assets, restore a bundle on another device, export SRT, or render a browser motion-comic.

## Current boundaries

- **PDF page extraction:** implemented in the browser with PDF.js, capped at 30 pages per import operation.
- **OCR:** Tesseract.js with English or Hindi+English language data is loaded on demand. Results need human review, especially for stylized fonts and speech bubbles.
- **Panel detection:** OpenCV.js contour-based candidate detection with optional page rectification. It is not a trained comic understanding model and can miss borderless, overlapping or irregular panels.
- **Vision LLM:** configurable OpenAI-compatible `/chat/completions` gateway; custom providers must accept multimodal `image_url` content. AI image generation requires the compatible `/images/generations` endpoint. The hosted API rejects local/private hostnames and IP-literal provider URLs.
- **Project restore:** portable `.indica.json` bundles embed image blobs as base64, so backups can be large; separate asset export remains available.
- **Voice:** browser/system speech synthesis is a preview only. It does not create a persistent voice track or guarantee Hindi voice availability.
- **AI providers:** none is configured by default. Provider calls send the selected image or prompt to the provider you choose; avoid confidential content unless your provider policy permits it. Keys are not persisted by the app, but they transit the app server during requests.
- **Video:** rendering is local in the browser and uses its MediaRecorder implementation. Some browsers can record MP4; others produce WebM. For MP4 on a WebM-only browser, convert locally with FFmpeg:
  ```bash
  ffmpeg -i episode.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart episode.mp4
  ```
- **Persistence:** IndexedDB is local to the browser profile/device. Clearing site data removes local projects. Export backups before switching devices.
- **Testing:** CI checks TypeScript, ESLint and unit tests. Validate the actual hosted deployment and perform a manual import/edit/export smoke test before inviting external testers.

## Privacy and deployment

Source images are processed in the browser by import, PDF conversion, OCR, and local render controls. If you use AI vision or generation, the selected image/prompt is sent to the configured provider through the app API. Provider keys are held only in page memory and are not stored in the project, IndexedDB or localStorage. The public site can be opened by other people, so avoid shared devices for private source material. Vercel serves the dashboard and relays provider calls; it does not provide shared project storage or a server-side FFmpeg render queue.
