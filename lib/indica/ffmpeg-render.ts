type FfmpegApi = {
  createFFmpeg(options: { log?: boolean; corePath?: string; progress?: (event: { ratio: number }) => void }): {
    load(): Promise<void>
    FS(method: "writeFile", path: string, data: Uint8Array): void
    FS(method: "readFile", path: string): Uint8Array
    run(...args: string[]): Promise<void>
    isLoaded(): boolean
  }
}
type FfmpegWindow = Window & { FFmpeg?: FfmpegApi; __indicaFfmpegScript?: Promise<void> }

function loadFfmpegScript(): Promise<void> {
  const host=window as FfmpegWindow
  if(host.FFmpeg)return Promise.resolve()
  if(host.__indicaFfmpegScript)return host.__indicaFfmpegScript
  host.__indicaFfmpegScript=new Promise((resolve,reject)=>{
    const script=document.createElement("script")
    script.src="https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js"
    script.async=true
    script.onload=()=>host.FFmpeg?resolve():reject(new Error("FFmpeg browser runtime did not initialize"))
    script.onerror=()=>{host.__indicaFfmpegScript=undefined;reject(new Error("Could not load FFmpeg browser runtime"))}
    document.head.appendChild(script)
  })
  return host.__indicaFfmpegScript
}

/** Deterministic H.264 MP4 transcode in the browser; no source media is uploaded. */
export async function transcodeToMp4(input: Blob, onProgress?: (percent: number)=>void): Promise<Blob> {
  await loadFfmpegScript()
  const ffmpeg=(window as FfmpegWindow).FFmpeg
  if(!ffmpeg)throw new Error("FFmpeg is unavailable in this browser")
  const engine=ffmpeg.createFFmpeg({
    log:false,
    corePath:"https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
    progress:event=>onProgress?.(Math.max(0,Math.min(100,Math.round(event.ratio*100))))
  })
  await engine.load()
  const bytes=new Uint8Array(await input.arrayBuffer())
  engine.FS("writeFile","indica-input.webm",bytes)
  await engine.run("-i","indica-input.webm","-an","-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p","-movflags","+faststart","indica-output.mp4")
  const output=engine.FS("readFile","indica-output.mp4")
  return new Blob([new Uint8Array(output)],{type:"video/mp4"})
}
