/* Browser-only comic vision helpers. Heavy engines are loaded on demand after user action. */
export type Rect = { x: number; y: number; w: number; h: number }
export type VisionPanel = Rect & { confidence: number; kind: "panel" | "text" | "bubble" }
export type OcrWord = { text: string; confidence: number; box: Rect }
type CvMat = { rows: number; cols: number; data: Uint8Array; delete(): void }
type CvPoint = { x: number; y: number }
type CvApi = Record<string, any>
type TesseractApi = {
  createWorker(languages: string, oem?: number, options?: Record<string, unknown>): Promise<{
    recognize(input: Blob | HTMLCanvasElement): Promise<{ data: { text: string; words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> } }>
    terminate(): Promise<void>
  }>
}
type PdfJsApi = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(input: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getViewport(input: { scale: number }): { width: number; height: number }; render(input: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> } }> }> }
}
type BrowserWindow = Window & { cv?: CvApi; Tesseract?: TesseractApi; pdfjsLib?: PdfJsApi; __indicaScripts?: Record<string, Promise<void>> }

function loadScript(url: string): Promise<void> {
  const host = window as BrowserWindow
  host.__indicaScripts ??= {}
  if (host.__indicaScripts[url]) return host.__indicaScripts[url]
  host.__indicaScripts[url] = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-indica-src="${url}"]`)
    if (existing?.dataset.loaded === "true") { resolve(); return }
    const script = existing ?? document.createElement("script")
    script.src = url
    script.async = true
    script.dataset.indicaSrc = url
    script.onload = () => { script.dataset.loaded = "true"; resolve() }
    script.onerror = () => { delete host.__indicaScripts?.[url]; reject(new Error(`Could not load processing engine: ${new URL(url).hostname}`)) }
    if (!existing) document.head.appendChild(script)
  })
  return host.__indicaScripts[url]
}

async function getCv(): Promise<CvApi> {
  const host = window as BrowserWindow
  if (!host.cv) {
    await loadScript("https://docs.opencv.org/4.x/opencv.js")
    if (!host.cv) await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("OpenCV.js did not initialize")), 20000)
      const poll = () => {
        if (host.cv?.Mat) { window.clearTimeout(timeout); resolve() }
        else window.setTimeout(poll, 100)
      }
      poll()
    })
  }
  return host.cv!
}
async function getTesseract() {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js")
  const engine = (window as BrowserWindow).Tesseract
  if (!engine) throw new Error("Tesseract OCR did not initialize")
  return engine
}
async function getPdfJs() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js")
  const pdf = (window as BrowserWindow).pdfjsLib
  if (!pdf) throw new Error("PDF.js did not initialize")
  pdf.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  return pdf
}
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decoding failed")) }
    image.src = url
  })
}
function canvasBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.94): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode processed image")), type, quality))
}
export async function rectifyPage(blob: Blob): Promise<Blob> {
  const cv = await getCv()
  const image = await loadImage(blob)
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.drawImage(image, 0, 0)
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let best: CvMat | null = null
  let bestArea = 0
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 45, 140)
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.dilate(edges, edges, kernel)
    kernel.delete()
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const perimeter = cv.arcLength(contour, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(contour, approx, 0.025 * perimeter, true)
      const area = Math.abs(cv.contourArea(contour))
      if (approx.rows === 4 && area > src.rows * src.cols * 0.16 && area > bestArea && cv.isContourConvex(approx)) {
        best?.delete()
        best = approx.clone()
        bestArea = area
      } else approx.delete()
      contour.delete()
    }
    if (!best) return await canvasBlob(canvas)
    const points: CvPoint[] = []
    for (let i = 0; i < 4; i++) points.push({ x: best.data32S[i * 2], y: best.data32S[i * 2 + 1] })
    const sum = (p: CvPoint) => p.x + p.y
    const diff = (p: CvPoint) => p.x - p.y
    const tl = points.reduce((a,b)=>sum(a)<sum(b)?a:b)
    const br = points.reduce((a,b)=>sum(a)>sum(b)?a:b)
    const tr = points.reduce((a,b)=>diff(a)>diff(b)?a:b)
    const bl = points.reduce((a,b)=>diff(a)<diff(b)?a:b)
    const width = Math.max(Math.hypot(br.x-bl.x, br.y-bl.y), Math.hypot(tr.x-tl.x, tr.y-tl.y))
    const height = Math.max(Math.hypot(tr.x-br.x, tr.y-br.y), Math.hypot(tl.x-bl.x, tl.y-bl.y))
    if (width < 120 || height < 120) return await canvasBlob(canvas)
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y])
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0,0,width-1,0,width-1,height-1,0,height-1])
    const transform = cv.getPerspectiveTransform(srcPts, dstPts)
    const output = new cv.Mat()
    try {
      cv.warpPerspective(src, output, transform, new cv.Size(Math.round(width), Math.round(height)), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar())
      const result = document.createElement("canvas")
      cv.imshow(result, output)
      return await canvasBlob(result)
    } finally { srcPts.delete(); dstPts.delete(); transform.delete(); output.delete() }
  } finally {
    src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete(); best?.delete()
  }
}
export async function detectComicRegions(blob: Blob): Promise<VisionPanel[]> {
  const cv = await getCv()
  const image = await loadImage(blob)
  const canvas = document.createElement("canvas")
  const scale = Math.min(1, 1200 / image.naturalWidth, 1600 / image.naturalHeight)
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.drawImage(image,0,0,canvas.width,canvas.height)
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const binary = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const found: VisionPanel[] = []
  try {
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(gray,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,31,9)
    const kernel = cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3))
    cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel)
    kernel.delete()
    cv.findContours(binary,contours,hierarchy,cv.RETR_TREE,cv.CHAIN_APPROX_SIMPLE)
    const pageArea = canvas.width*canvas.height
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i)
      const area=Math.abs(cv.contourArea(contour))
      if(area<pageArea*0.018||area>pageArea*0.94){contour.delete();continue}
      const rect=cv.boundingRect(contour)
      const ratio=rect.width/Math.max(1,rect.height)
      const extent=area/Math.max(1,rect.width*rect.height)
      if(rect.width>canvas.width*0.13&&rect.height>canvas.height*0.09&&ratio>0.16&&ratio<5.5&&extent>0.35){
        const candidate={x:rect.x/canvas.width,y:rect.y/canvas.height,w:rect.width/canvas.width,h:rect.height/canvas.height,confidence:Math.min(0.98,extent),kind:"panel" as const}
        const duplicate=found.some(p=>Math.abs(p.x-candidate.x)<0.025&&Math.abs(p.y-candidate.y)<0.025&&Math.abs(p.w-candidate.w)<0.04&&Math.abs(p.h-candidate.h)<0.04)
        if(!duplicate)found.push(candidate)
      }
      contour.delete()
    }
  } finally { src.delete();gray.delete();binary.delete();contours.delete();hierarchy.delete() }
  const filtered=found.filter(p=>!found.some(q=>q!==p&&q.w>=p.w*1.08&&q.h>=p.h*1.08&&q.x<=p.x+0.015&&q.y<=p.y+0.015&&q.x+q.w>=p.x+p.w-0.015&&q.y+q.h>=p.y+p.h-0.015))
  return filtered.length>=2?filtered.sort((a,b)=>a.y-b.y||a.x-b.x):[{x:0,y:0,w:1,h:1,confidence:0.25,kind:"panel"}]
}
export async function extractText(blob: Blob, language = "eng+hin"): Promise<{text:string;words:OcrWord[]}> {
  const engine=await getTesseract()
  const worker=await engine.createWorker(language)
  try{
    const result=await worker.recognize(blob)
    const words=(result.data.words??[]).map(word=>({text:word.text,confidence:word.confidence,box:{x:word.bbox.x0,y:word.bbox.y0,w:word.bbox.x1-word.bbox.x0,h:word.bbox.y1-word.bbox.y0}}))
    return {text:result.data.text.trim(),words}
  }finally{await worker.terminate()}
}
export async function pdfToImages(file: File, maxPages = 30): Promise<Array<{name:string;blob:Blob}>> {
  const pdf=await getPdfJs()
  const document=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise
  const pages:Array<{name:string;blob:Blob}>=[]
  const count=Math.min(document.numPages,maxPages)
  for(let n=1;n<=count;n++){
    const page=await document.getPage(n)
    const viewport=page.getViewport({scale:1.7})
    const canvas=document.createElement("canvas")
    canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height)
    const context=canvas.getContext("2d")
    if(!context)throw new Error("Canvas is unavailable for PDF extraction")
    await page.render({canvasContext:context,viewport}).promise
    pages.push({name:`${file.name.replace(/\.pdf$/i,"")}-page-${String(n).padStart(3,"0")}.jpg`,blob:await canvasBlob(canvas)})
  }
  return pages
}
export async function extractVideoFrames(file: File, intervalSeconds = 1.25, maxFrames = 30): Promise<Array<{name:string;blob:Blob;time:number}>> {
  const url=URL.createObjectURL(file)
  const video=document.createElement("video")
  video.muted=true;video.playsInline=true;video.preload="metadata";video.src=url
  try{
    await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error("Could not read this video file"));})
    const duration=video.duration
    if(!Number.isFinite(duration)||duration<=0)throw new Error("Video has no readable duration")
    const count=Math.min(maxFrames,Math.max(1,Math.ceil(duration/intervalSeconds)))
    const frames:Array<{name:string;blob:Blob;time:number}>=[]
    let lastSignature=""
    for(let i=0;i<count;i++){
      const time=Math.min(Math.max(0,duration-0.05),i*intervalSeconds)
      await new Promise<void>((resolve,reject)=>{video.onseeked=()=>resolve();video.onerror=()=>reject(new Error("Could not seek video frame"));video.currentTime=time})
      const canvas=document.createElement("canvas")
      const scale=Math.min(1,1600/video.videoWidth,1600/video.videoHeight)
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale))
      const ctx=canvas.getContext("2d")
      if(!ctx)throw new Error("Canvas is unavailable for video extraction")
      ctx.drawImage(video,0,0,canvas.width,canvas.height)
      const sample=ctx.getImageData(Math.floor(canvas.width*.5),Math.floor(canvas.height*.5),1,1).data
      const signature=`${Math.round(sample[0]/16)}-${Math.round(sample[1]/16)}-${Math.round(sample[2]/16)}-${canvas.width}x${canvas.height}`
      if(signature===lastSignature&&i%3!==0)continue
      lastSignature=signature
      frames.push({name:`${file.name.replace(/\.[^.]+$/,"")}-frame-${String(i+1).padStart(3,"0")}-${time.toFixed(1)}s.jpg`,blob:await canvasBlob(canvas),time})
    }
    return frames
  }finally{video.pause();video.removeAttribute("src");video.load();URL.revokeObjectURL(url)}
}
export async function cropRegion(blob: Blob, rect: Rect): Promise<Blob> {
  const image=await loadImage(blob)
  const canvas=document.createElement("canvas")
  const x=Math.max(0,Math.floor(rect.x*image.naturalWidth))
  const y=Math.max(0,Math.floor(rect.y*image.naturalHeight))
  const w=Math.max(1,Math.min(image.naturalWidth-x,Math.ceil(rect.w*image.naturalWidth)))
  const h=Math.max(1,Math.min(image.naturalHeight-y,Math.ceil(rect.h*image.naturalHeight)))
  canvas.width=w;canvas.height=h
  const ctx=canvas.getContext("2d")
  if(!ctx)throw new Error("Canvas is unavailable")
  ctx.drawImage(image,x,y,w,h,0,0,w,h)
  return canvasBlob(canvas)
}
