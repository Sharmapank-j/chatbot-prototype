"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  IconArrowLeft, IconBook2, IconCheck, IconChevronDown, IconChevronUp,
  IconDownload, IconFolder, IconMovie, IconPlayerPlay,
  IconPlus, IconRefresh, IconSettings, IconShieldLock, IconTrash, IconVolume,
  IconX
} from "@tabler/icons-react"
import { classifyComicFile, MAX_COMIC_BATCH_BYTES, MAX_COMIC_FILES } from "@/lib/indica/file-validation"
import { detectComicRegions, extractText, extractVideoFrames, pdfToImages, rectifyPage, cropRegion } from "@/lib/indica/comic-vision"
import { parseProjectBundle, serializeProjectBundle } from "@/lib/indica/project-bundle"

type Shot = {
  id: string
  assetId: string
  title: string
  dialogue: string
  speaker: string
  start: number
  duration: number
  zoom: number
  crop?: { x: number; y: number; w: number; h: number }
}
type Asset = { id: string; name: string; type: string; size: number; blob: Blob }
type Project = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  language: string
  aspect: string
  direction: string
  shots: Shot[]
  assets: Asset[]
}
const DB_NAME = "indica-anime-studio"
const DB_VERSION = 1
const STORE = "projects"
const newId = () => crypto.randomUUID()
const fmt = (n: number) => `${Math.floor(n / 60).toString().padStart(2, "0")}:${Math.floor(n % 60).toString().padStart(2, "0")}`

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function listProjects(): Promise<Project[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
    request.onsuccess = () => { db.close(); resolve((request.result as Project[]).sort((a, b) => b.updatedAt - a.updatedAt)) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}
async function saveProject(project: Project): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(project)
    request.onsuccess = () => { db.close(); resolve() }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}
async function deleteProject(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id)
    request.onsuccess = () => { db.close(); resolve() }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
function escapeSrt(value: string) {
  return value.replace(/\r?\n/g, " ").trim()
}
function makeSrt(shots: Shot[]) {
  return shots.map((shot, i) => {
    const start = Math.max(0, shot.start)
    const end = start + Math.max(0.5, shot.duration)
    const stamp = (n: number) => {
      const ms = Math.round(n * 1000)
      return `${Math.floor(ms / 3600000).toString().padStart(2, "0")}:${Math.floor((ms % 3600000) / 60000).toString().padStart(2, "0")}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, "0")},${(ms % 1000).toString().padStart(3, "0")}`
    }
    return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${escapeSrt(shot.dialogue)}\n`
  }).join("\n")
}
function detectGutterPanels(image: HTMLImageElement): Array<{x:number;y:number;w:number;h:number}> {
  const canvas = document.createElement("canvas")
  const scale = Math.min(1, 240 / image.naturalWidth, 320 / image.naturalHeight)
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return [{x:0,y:0,w:1,h:1}]
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const horizontalCuts: number[] = []
  const verticalCuts: number[] = []
  for (let y = 2; y < height - 2; y++) {
    let bright = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] > 238 && data[i+1] > 238 && data[i+2] > 238) bright++
    }
    if (bright / width > 0.94) horizontalCuts.push(y)
  }
  for (let x = 2; x < width - 2; x++) {
    let bright = 0
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      if (data[i] > 238 && data[i+1] > 238 && data[i+2] > 238) bright++
    }
    if (bright / height > 0.94) verticalCuts.push(x)
  }
  const groupCuts = (values: number[]) => {
    const groups: number[] = []
    for (const value of values) {
      if (!groups.length || value - groups[groups.length - 1] > 3) groups.push(value)
    }
    return groups.filter((value, i, arr) => value > 0.06 * (values[values.length - 1] || 1) && value < (values[values.length - 1] || 1) * 0.94)
  }
  const ys = [0, ...groupCuts(horizontalCuts), height]
  const xs = [0, ...groupCuts(verticalCuts), width]
  const panels: Array<{x:number;y:number;w:number;h:number}> = []
  for (let yi=0; yi<ys.length-1; yi++) for (let xi=0; xi<xs.length-1; xi++) {
    const x=xs[xi], y=ys[yi], w=xs[xi+1]-x, h=ys[yi+1]-y
    if (w > width*0.16 && h > height*0.12) panels.push({x:x/width,y:y/height,w:w/width,h:h/height})
  }
  return panels.length > 1 && panels.length <= 12 ? panels : [{x:0,y:0,w:1,h:1}]
}
function makeProject(name = "Untitled episode"): Project {
  const now = Date.now()
  return { id: newId(), name, createdAt: now, updatedAt: now, language: "hi", aspect: "16:9", direction: "ltr", shots: [], assets: [] }
}

export default function IndicaWorkspacePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [selectedShot, setSelectedShot] = useState("")
  const [notice, setNotice] = useState("Loading local workspace…")
  const [isDragging, setIsDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<"assets"|"storyboard"|"dialogue"|"ai"|"export">("storyboard")
  const [renderProgress, setRenderProgress] = useState(0)
  const [providerBaseUrl, setProviderBaseUrl] = useState("https://api.openai.com/v1")
  const [providerModel, setProviderModel] = useState("gpt-4o-mini")
  const [providerKey, setProviderKey] = useState("")
  const [providerResult, setProviderResult] = useState("")
  const [providerImage, setProviderImage] = useState("")
  const [providerBusy, setProviderBusy] = useState(false)
  const [localWorkerUrl, setLocalWorkerUrl] = useState("http://127.0.0.1:8765")
  const [localWorkerToken, setLocalWorkerToken] = useState("")
  const [localWorkerStatus, setLocalWorkerStatus] = useState("Not checked")
  const [providerMode, setProviderMode] = useState<"hosted"|"local">("hosted")
  const [localModelPath, setLocalModelPath] = useState("")
  const [localModelName, setLocalModelName] = useState("")
  const [localModelStatus, setLocalModelStatus] = useState("No local GGUF loaded")
  const [localContext, setLocalContext] = useState(4096)
  const [localGpuLayers, setLocalGpuLayers] = useState(-1)
  const localModelInput = useRef<HTMLInputElement>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const totalBytes = useMemo(() => project?.assets.reduce((n, a) => n + a.size, 0) ?? 0, [project])
  const duration = useMemo(() => project?.shots.reduce((n, s) => Math.max(n, s.start + s.duration), 0) ?? 0, [project])
  const activeShot = project?.shots.find(s => s.id === selectedShot) ?? project?.shots[0] ?? null

  useEffect(() => {
    let cancelled = false
    void listProjects().then(all => {
      if (cancelled) return
      setProjects(all)
      setProject(current => current ?? all[0] ?? null)
      setNotice(all.length ? "Local projects loaded. Source files remain on this device." : "Ready. Create a project or import comic pages to begin.")
    }).catch(() => {
      if (!cancelled) setNotice("Local storage is unavailable in this browser session. Try a current browser with site storage enabled.")
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!project) return
    const timer = window.setTimeout(async () => {
      const updated = { ...project, updatedAt: Date.now() }
      try {
        await saveProject(updated)
        setProjects(current => [updated, ...current.filter(item => item.id !== updated.id)].sort((a,b) => b.updatedAt-a.updatedAt))
        setNotice("Saved locally on this device.")
      } catch {
        setNotice("Could not save locally. Check browser storage quota.")
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [project])

  const updateProject = (patch: Partial<Project>) => setProject(current => current ? { ...current, ...patch, updatedAt: Date.now() } : current)
  const updateShot = (id: string, patch: Partial<Shot>) => setProject(current => current ? { ...current, shots: current.shots.map(s => s.id === id ? { ...s, ...patch } : s), updatedAt: Date.now() } : current)

  async function createProject() {
    const next = makeProject()
    await saveProject(next)
    setProject(next)
    setProjects(current => [next, ...current])
    setSelectedShot("")
    setNotice("New local project created.")
  }
  async function removeProject(id: string) {
    await deleteProject(id)
    const remaining = projects.filter(p => p.id !== id)
    setProjects(remaining)
    if (project?.id === id) setProject(remaining[0] ?? null)
    setNotice("Project deleted from this browser.")
  }
  function moveShot(id: string, delta: number) {
    if (!project) return
    const index = project.shots.findIndex(s => s.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= project.shots.length) return
    const shots = [...project.shots]
    ;[shots[index], shots[target]] = [shots[target], shots[index]]
    let t = 0
    const normalized = shots.map(s => { const item = { ...s, start: t }; t += item.duration; return item })
    updateProject({ shots: normalized })
  }

  async function importFiles(list: FileList | null) {
    if (!project || !list?.length) return
    const files = Array.from(list)
    const images = files.filter(f => classifyComicFile(f).kind === "image")
    const pdfs = files.filter(f => classifyComicFile(f).kind === "pdf")
    const videos = files.filter(f => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name))
    const rejected = files.filter(f => !images.includes(f) && !pdfs.includes(f) && !videos.includes(f))
    if (rejected.length) setNotice(`${rejected.length} unsupported file(s) skipped. Use JPG, PNG, WEBP, PDF or a supported video.`)
    setBusy(true)
    try {
      const incoming: Array<{name:string;type:string;blob:Blob}> = images.map(file=>({name:file.name,type:file.type||"image/jpeg",blob:file}))
      for (const pdf of pdfs) {
        setNotice(`Extracting pages from ${pdf.name}…`)
        const pages=await pdfToImages(pdf,MAX_COMIC_FILES)
        incoming.push(...pages.map(page=>({name:page.name,type:"image/jpeg",blob:page.blob})))
      }
      for (const video of videos) {
        setNotice(`Sampling video frames and correcting page perspective: ${video.name}…`)
        const frames=await extractVideoFrames(video,1.1,MAX_COMIC_FILES)
        for (const frame of frames) {
          let blob=frame.blob
          try { blob=await rectifyPage(blob) } catch { /* Keep the frame if CV cannot find a page. */ }
          incoming.push({name:frame.name,type:"image/jpeg",blob})
        }
      }
      const existing = new Set(project.assets.map(a => `${a.name}:${a.size}`))
      const fresh = incoming.filter(item => !existing.has(`${item.name}:${item.blob.size}`))
      if (project.assets.length + fresh.length > MAX_COMIC_FILES) throw new Error(`Project limit is ${MAX_COMIC_FILES} source images/frames. Import fewer pages or split the episode into projects.`)
      const currentBytes=project.assets.reduce((n,a)=>n+a.size,0)
      const incomingBytes=fresh.reduce((n,f)=>n+f.blob.size,0)
      if(currentBytes+incomingBytes>MAX_COMIC_BATCH_BYTES)throw new Error("Project limit is 500 MB total. Remove assets before importing more.")
      if(!fresh.length){setNotice("No new supported media pages or frames to add.");return}
      const assets:Asset[]=fresh.map(item=>({id:newId(),name:item.name,type:item.type,size:item.blob.size,blob:item.blob}))
      const initialStart=project.shots.reduce((n,s)=>Math.max(n,s.start+s.duration),0)
      const newShots:Shot[]=assets.map((asset,index)=>({
        id:newId(),assetId:asset.id,title:`Shot ${project.shots.length+index+1}`,dialogue:"",speaker:"",
        start:initialStart+index*3,duration:3,zoom:1.08
      }))
      const next={...project,assets:[...project.assets,...assets],shots:[...project.shots,...newShots],updatedAt:Date.now()}
      setProject(next)
      if(!selectedShot&&newShots[0])setSelectedShot(newShots[0].id)
      setNotice(`Imported ${assets.length} page image(s)/video frame(s). Next run Detect panels, then OCR text to extract dialogue. Video/PDF conversion runs in your browser.`)
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Media import failed.")
    } finally {setBusy(false)}
  }

  async function detectPanels() {
    if (!project) return
    const candidates:Shot[]=[]
    setBusy(true)
    try {
      for(const asset of project.assets){
        if(!asset.type.startsWith("image/"))continue
        setNotice(`Detecting panel boundaries in ${asset.name}…`)
        const regions=await detectComicRegions(asset.blob)
        const old=project.shots.filter(s=>s.assetId===asset.id)
        const each=old.length?Math.max(1,old.reduce((n,s)=>n+s.duration,0)/regions.length):3/regions.length
        regions.forEach((region,index)=>candidates.push({
          id:newId(),assetId:asset.id,title:regions.length===1?asset.name:`Panel ${index+1} · ${asset.name}`,
          dialogue:old[index]?.dialogue??"",speaker:old[index]?.speaker??"",
          start:old[0]?.start??0,duration:each,zoom:1.04,crop:region
        }))
      }
      if(!candidates.length){setNotice("Import images or video frames first.");return}
      let cursor=0
      const ordered=candidates.map(s=>{const next={...s,start:cursor};cursor+=next.duration;return next})
      updateProject({shots:ordered})
      setSelectedShot(ordered[0].id)
      setNotice(`Vision pass found ${ordered.length} panel candidate(s). Review the crop boxes; complex or borderless panels may need manual correction.`)
    }catch(error){setNotice(error instanceof Error?error.message:"Panel detection failed. Check the network connection for the on-demand OpenCV engine.")}
    finally{setBusy(false)}
  }

  async function runOcr() {
    if(!project||!project.shots.length)return
    setBusy(true)
    let completed=0
    try{
      const nextShots=[...project.shots]
      for(let i=0;i<nextShots.length;i++){
        const shot=nextShots[i]
        const asset=project.assets.find(a=>a.id===shot.assetId)
        if(!asset)continue
        setNotice(`OCR ${i+1}/${nextShots.length}: ${shot.title}…`)
        const region=shot.crop?await cropRegion(asset.blob,shot.crop):asset.blob
        const result=await extractText(region,project.language==="en"?"eng":"hin+eng")
        if(result.text)nextShots[i]={...shot,dialogue:shot.dialogue.trim()?shot.dialogue:result.text}
        completed++
      }
      updateProject({shots:nextShots})
      setNotice(`OCR pass finished for ${completed} shot(s). Review and correct recognized text; comic lettering, stylized fonts and speech bubbles can lower accuracy.`)
    }catch(error){setNotice(error instanceof Error?error.message:"OCR failed. The OCR engine and language data load on demand.")}
    finally{setBusy(false)}
  }

  async function rectifyAssets() {
    if(!project)return
    setBusy(true)
    try{
      const replacements=new Map<string,Blob>()
      for(const asset of project.assets){
        setNotice(`Correcting page perspective: ${asset.name}…`)
        replacements.set(asset.id,await rectifyPage(asset.blob))
      }
      const assets=project.assets.map(asset=>{const blob=replacements.get(asset.id);return blob?{...asset,blob,size:blob.size,type:"image/jpeg"}:asset})
      updateProject({assets})
      setNotice("Page rectification pass complete. Review pages and run Detect panels again.")
    }catch(error){setNotice(error instanceof Error?error.message:"Perspective correction failed.")}
    finally{setBusy(false)}
  }

  async function exportProject() {
    if (!project) return
    setBusy(true)
    try {
      const text = await serializeProjectBundle(project, blobToDataUrl)
      if (text.length > 650 * 1024 * 1024) throw new Error("Project bundle is too large to export as one JSON file. Export source assets individually.")
      downloadBlob(new Blob([text], {type:"application/json"}), `${safeName(project.name)}.indica.json`)
      setNotice("Portable project backup exported with source assets and timeline.")
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Could not export the complete project bundle.")
    } finally { setBusy(false) }
  }
  async function restoreProject(file: File | null) {
    if(!file)return
    setBusy(true)
    try {
      if(file.size>700*1024*1024)throw new Error("Project bundle exceeds the 700 MB import limit.")
      const restored=parseProjectBundle(await file.text(),file.name) as Project
      await saveProject(restored)
      setProjects(current=>[restored,...current.filter(p=>p.id!==restored.id)])
      setProject(restored);setSelectedShot(restored.shots[0]?.id??"")
      setNotice(`Restored ${restored.name} with ${restored.assets.length} source assets and ${restored.shots.length} timeline shots.`)
    }catch(error){setNotice(error instanceof Error?error.message:"Project restore failed.")}
    finally{setBusy(false);if(restoreInput.current)restoreInput.current.value=""}
  }
  function exportAssets() {
    if (!project) return
    const manifest = project.assets.map(a => ({id:a.id,name:a.name,type:a.type,size:a.size}))
    downloadBlob(new Blob([JSON.stringify(manifest)], {type:"application/json"}), `${safeName(project.name)}-assets-manifest.json`)
    project.assets.forEach((asset, index) => window.setTimeout(() => downloadBlob(asset.blob, `${String(index+1).padStart(2,"0")}-${safeName(asset.name)}`), index*180))
    setNotice("Downloading source assets individually with an asset manifest.")
  }
  function exportSrt() {
    if (!project) return
    downloadBlob(new Blob([makeSrt(project.shots)], {type:"text/plain;charset=utf-8"}), `${safeName(project.name)}.srt`)
    setNotice("Subtitle file exported.")
  }
  function speakDialogue() {
    if (!activeShot?.dialogue.trim()) { setNotice("Enter dialogue for the selected shot first."); return }
    if (!("speechSynthesis" in window)) { setNotice("Browser speech synthesis is not available on this device."); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(activeShot.dialogue)
    utterance.lang = project?.language === "hi" ? "hi-IN" : project?.language === "en" ? "en-IN" : "en-US"
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find(v => v.lang.toLowerCase() === utterance.lang.toLowerCase()) ?? voices.find(v => v.lang.toLowerCase().startsWith(utterance.lang.slice(0,2)))
    if (voice) utterance.voice = voice
    utterance.onstart = () => setNotice(`Playing system voice: ${voice?.name ?? "browser default"}. This is a preview, not an exported audio track.`)
    utterance.onerror = () => setNotice("Voice preview failed or was interrupted.")
    window.speechSynthesis.speak(utterance)
  }
  async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error("Could not read image"));reader.onerror=()=>reject(new Error("Could not read image"));reader.readAsDataURL(blob)})
  }
  async function callAiProvider(action:"analyze"|"generate"|"generate-image", prompt:string, imageDataUrl?:string) {
    if(!providerKey.trim()){setNotice("Enter your provider API key in the AI Providers tab. The key is kept in page memory only.");setActiveTab("ai");return null}
    setProviderBusy(true);setProviderResult("");setProviderImage("")
    try {
      const response=await fetch("/api/indica/provider",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,baseUrl:providerBaseUrl,model:providerModel,apiKey:providerKey,prompt,imageDataUrl})})
      const result=await response.json() as {error?:string;text?:string;imageDataUrl?:string;imageUrl?:string;revisedPrompt?:string}
      if(!response.ok)throw new Error(result.error||"Provider request failed")
      if(result.text){setProviderResult(result.text);return result.text}
      if(result.imageDataUrl||result.imageUrl){setProviderImage(result.imageDataUrl||result.imageUrl||"");setProviderResult(result.revisedPrompt||prompt);return result.revisedPrompt||prompt}
      throw new Error("Provider returned no result")
    } catch(error) {
      setNotice(error instanceof Error?error.message:"AI provider request failed.")
      return null
    } finally {setProviderBusy(false)}
  }
  async function prepareProviderImage(blob:Blob):Promise<string> {
    const url=URL.createObjectURL(blob)
    try {
      const image=new Image()
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Could not decode selected image"));image.src=url})
      const scale=Math.min(1,1800/image.naturalWidth,1800/image.naturalHeight)
      const canvas=document.createElement("canvas")
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
      const ctx=canvas.getContext("2d")
      if(!ctx)throw new Error("Canvas unavailable for provider image compression")
      ctx.drawImage(image,0,0,canvas.width,canvas.height)
      for(const quality of [0.86,0.74,0.62,0.5]) {
        const compressed=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Image compression failed")),"image/jpeg",quality))
        if(compressed.size<=2.8*1024*1024)return await blobToDataUrl(compressed)
      }
      throw new Error("Selected panel is too large to send safely to the provider. Crop the panel more tightly.")
    } finally {URL.revokeObjectURL(url)}
  }
  async function analyzeCurrentPage() {
    if(providerMode==="local"){setNotice("The current llama.cpp adapter is text-only. Run local OCR for text extraction; image understanding requires a multimodal GGUF and a separately configured vision-capable inference path.");return}
    if(!project||!activeShot){setNotice("Import a comic page and select a shot first.");return}
    const asset=project.assets.find(a=>a.id===activeShot.assetId)
    if(!asset){setNotice("The selected shot has no source image.");return}
    try {
      const region=activeShot.crop?await cropRegion(asset.blob,activeShot.crop):asset.blob
      const imageDataUrl=await prepareProviderImage(region)
      const prompt="Analyze this comic/manga panel as a visual production assistant. Return structured JSON with: panel_summary, characters (appearance and position), visible_text (each speech bubble/sign/SFX separately with exact text and confidence), dialogue (speaker, exact text, emotion, language), shot_type, camera_motion, visual_effects, scene_continuity, reading_order, and uncertainties. Do not invent unreadable words; mark them uncertain. Preserve original text/script. Use concise fields."
      await callAiProvider("analyze",prompt,imageDataUrl)
    } catch(error){setNotice(error instanceof Error?error.message:"Could not prepare the selected image for vision analysis.")}
  }
  function applyVisionDialogue() {
    if(!activeShot||!providerResult.trim()){setNotice("Run vision analysis first.");return}
    try {
      const jsonText=providerResult.slice(providerResult.indexOf("{"),providerResult.lastIndexOf("}")+1)
      const parsed=JSON.parse(jsonText) as {dialogue?:Array<{speaker?:string;text?:string;exact_text?:string}>;visible_text?:Array<{text?:string;exact_text?:string;kind?:string}>}
      const lines=(parsed.dialogue??[]).map(item=>({speaker:item.speaker??"",text:item.text??item.exact_text??""})).filter(item=>item.text.trim())
      const visible=(parsed.visible_text??[]).map(item=>item.text??item.exact_text??"").filter(Boolean)
      const text=lines.length?lines.map(item=>item.text).join("\n"):visible.join("\n")
      if(!text.trim())throw new Error("No readable dialogue was found in the model response.")
      updateShot(activeShot.id,{dialogue:text,...(lines[0]?.speaker?{speaker:lines[0].speaker}:{})})
      setNotice("Applied the vision model's extracted text to the selected shot. Verify every line before export.")
    }catch(error){setNotice(error instanceof Error?error.message:"Could not parse the vision response. Copy the text and edit dialogue manually.")}
  }
  async function generateScenePlan() {
    if(!project||!project.shots.length){setNotice("Import pages and create a storyboard before generating a scene plan.");return}
    const summary=project.shots.map((shot,index)=>({shot:index+1,title:shot.title,dialogue:shot.dialogue,speaker:shot.speaker,start:shot.start,duration:shot.duration,source:project.assets.find(a=>a.id===shot.assetId)?.name} ))
    const prompt="You are a comic-to-anime pre-production director. Use this storyboard to produce a coherent, production-ready scene plan. Return shot-by-shot JSON with visual_prompt, preserve_character_design, camera_motion, transitions, ambient_audio, voice_direction, subtitle_text, and negative_prompt. Do not claim to have generated media. Preserve the source story and character continuity. Storyboard: "+JSON.stringify({project:project.name,language:project.language,aspect:project.aspect,shots:summary})
    const result=providerMode==="local"?await runLocalLlm(prompt):await callAiProvider("generate",prompt)
    if(result)setNotice(providerMode==="local"?"Local GGUF scene plan generated without cloud inference.":"AI scene plan generated. Review it before using its prompts for image/video generation.")
  }
  async function generateImage() {
    const prompt=providerResult.trim()
    if(!prompt){setNotice("Run vision analysis or generate a scene plan first; the result will become the image-generation prompt.");return}
    if(providerMode==="local"){setNotice("A GGUF chat model generates text, not images. Switch to hosted image generation or connect a separate local image-generation tool.");return}
    const result=await callAiProvider("generate-image",prompt)
    if(result)setNotice("Image-generation request completed. Provider support depends on its OpenAI-compatible Images API.")
  }
  function validateLocalWorkerUrl(value:string):string {
    const url=new URL(value)
    if(url.protocol!=="http:"||!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new Error("For security, the media worker must be an HTTP loopback URL such as http://127.0.0.1:8765.")
    return url.origin
  }
  async function localWorkerFetch(path:string, body?:unknown) {
    const base=validateLocalWorkerUrl(localWorkerUrl)
    const response=await fetch(base+path,{
      method:body===undefined?"GET":"POST",
      headers:body===undefined?{"Cache-Control":"no-store"}:{"Content-Type":"application/json","Authorization":`Bearer ${localWorkerToken.trim()}`},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      cache:"no-store"
    })
    const result=await response.json().catch(()=>({error:"Local worker returned an invalid response."})) as {error?:string;message?:string;ready?:boolean;model?:string;text?:string;service?:string;ffmpeg?:boolean;piper?:boolean;llamaCpp?:boolean;llamaModel?:string}
    if(!response.ok)throw new Error(result.error||result.message||`Local worker returned HTTP ${response.status}.`)
    return result
  }
  async function checkLocalWorker() {
    try {
      const health=await localWorkerFetch("/health")
      if(health.service!=="indica-local-worker")throw new Error("This endpoint is not an Indica local worker.")
      setLocalWorkerStatus(`FFmpeg ${health.ffmpeg?"ready":"missing"} · Piper TTS ${health.piper?"ready":"not configured"} · llama.cpp ${health.llamaCpp?"ready":"not loaded"}`)
      setLocalModelStatus(health.llamaCpp?`Ready: ${health.llamaModel||"local GGUF"}`:"No local GGUF loaded")
      setNotice("Connected to the local worker. A selected GGUF model stays on this computer.")
    }catch(error){setLocalWorkerStatus("Unavailable");setNotice(error instanceof Error?error.message:"Could not connect to the local worker. Start scripts/indica_local_worker.py on this computer.")}
  }
  async function loadLocalGguf() {
    if(!localWorkerToken.trim()){setNotice("Start the local worker and paste its session token before loading a GGUF.");return}
    if(!localModelPath){setNotice("Choose a .gguf model file in the local file picker.");return}
    setProviderBusy(true);setLocalModelStatus("Loading model into local llama.cpp…")
    try {
      const result=await localWorkerFetch("/llama/load",{modelPath:localModelPath,contextTokens:localContext,gpuLayers:localGpuLayers,waitSeconds:120})
      setLocalModelName(result.model||localModelPath.split(/[\\/]/).pop()||"local model")
      setLocalModelStatus(result.ready?`Ready: ${result.model}`:`Still loading: ${result.model||"local GGUF"}`)
      setNotice(result.message||"Local GGUF provider initialized.")
      setProviderMode("local")
    } catch(error) {setLocalModelStatus("Load failed");setNotice(error instanceof Error?error.message:"Could not load local GGUF model.")}
    finally {setProviderBusy(false)}
  }
  async function unloadLocalGguf() {
    try {const result=await localWorkerFetch("/llama/unload",{});setLocalModelStatus("No local GGUF loaded");setLocalModelName("");setNotice(result.message||"Local model unloaded.")}
    catch(error){setNotice(error instanceof Error?error.message:"Could not unload local GGUF model.")}
  }
  async function runLocalLlm(prompt:string) {
    if(!localWorkerToken.trim()){setNotice("Paste the local worker token before sending a prompt.");return null}
    setProviderBusy(true);setProviderResult("");setProviderImage("")
    try {
      const result=await localWorkerFetch("/llama/chat",{prompt,system:"You are a precise comic-to-anime production assistant. Return JSON when asked, and never claim to have created media that you did not create."})
      if(!result.text)throw new Error("Local model returned no text.")
      setProviderResult(result.text);setNotice(`Response generated locally with ${result.model||localModelName||"GGUF model"}. Prompt stayed on this device.`)
      return result.text
    } catch(error){setNotice(error instanceof Error?error.message:"Local llama.cpp inference failed.");return null}
    finally {setProviderBusy(false)}
  }
  async function pollLocalGguf() {
    try {const result=await localWorkerFetch("/llama/status");setLocalModelStatus(result.ready?`Ready: ${result.model||"local GGUF"}`:"Model not ready");if(result.ready&&result.model)setLocalModelName(result.model)}
    catch(error){setNotice(error instanceof Error?error.message:"Could not query local model status.")}
  }
  async function renderVideo() {
    if(!project||!project.shots.length){setNotice("Import pages and create at least one storyboard shot before rendering.");return}
    if(!localWorkerToken.trim()){setNotice("Enter the local worker token printed by scripts/indica_local_worker.py.");return}
    if(project.shots.length>30){setNotice("The local renderer currently accepts up to 30 shots per render. Split this episode into smaller scenes.");return}
    setBusy(true);setRenderProgress(0)
    try{
      const base=validateLocalWorkerUrl(localWorkerUrl)
      const shots=[]
      for(let i=0;i<project.shots.length;i++){
        const shot=project.shots[i]
        const asset=project.assets.find(a=>a.id===shot.assetId)
        if(!asset)throw new Error(`Missing source asset for shot: ${shot.title}`)
        setNotice(`Preparing source ${i+1}/${project.shots.length}: ${shot.title}`)
        const region=shot.crop?await cropRegion(asset.blob,shot.crop):asset.blob
        const imageDataUrl=await prepareProviderImage(region)
        shots.push({title:shot.title,dialogue:shot.dialogue,speaker:shot.speaker,duration:shot.duration,zoom:shot.zoom,imageDataUrl})
        setRenderProgress(Math.round((i+1)/project.shots.length*25))
      }
      setNotice("Rendering deterministic H.264 MP4, synchronized voice track and subtitles with local FFmpeg…")
      const response=await fetch(base+"/render",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${localWorkerToken.trim()}`},body:JSON.stringify({name:project.name,aspect:project.aspect,language:project.language,shots}),cache:"no-store"})
      if(!response.ok){
        let message=`Local render failed (HTTP ${response.status}).`
        try{const data=await response.json() as {error?:string};if(data.error)message=data.error}catch{}
        throw new Error(message)
      }
      const bundle=await response.blob()
      if(!bundle.size||bundle.type!=="application/zip")throw new Error("Local worker returned an invalid render bundle.")
      setRenderProgress(100)
      downloadBlob(bundle,`${safeName(project.name)}-render-bundle.zip`)
      setNotice(`Rendered ${(bundle.size/1024/1024).toFixed(1)} MB bundle: episode.mp4, voice-track.wav, subtitles.srt and render manifest. Check the bundle's manifest for whether Piper TTS was configured.`)
    }catch(error){setNotice(error instanceof Error?error.message:"FFmpeg render failed. Check local worker logs and FFmpeg/Piper installation.")}
    finally{setBusy(false)}
  }
  function safeName(name:string) { return name.trim().replace(/[^a-z0-9-_]+/gi,"-").replace(/^-|-$/g,"").slice(0,60)||"indica-project" }

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#08090d] text-white selection:bg-violet-300/25">
      <div className="mx-auto w-full max-w-[1720px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <header className="sticky top-0 z-30 -mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#08090d]/95 px-3 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back home" className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white"><IconArrowLeft size={18}/></Link>
            <div><div className="text-sm font-semibold tracking-wide">INDICA <span className="text-violet-200">ANIME US</span></div><div className="text-xs text-white/40">Local-first studio · Prototype dashboard</div></div>
          </div>
          <div className="flex items-center gap-2 text-xs"><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-1.5 text-emerald-200"><IconShieldLock size={13} className="mr-1 inline"/> Device storage</span><button onClick={()=>void createProject()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-semibold text-black hover:bg-violet-100"><IconPlus size={15}/> New project</button></div>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2 lg:hidden"><button onClick={()=>setMobileSidebarOpen(v=>!v)} aria-expanded={mobileSidebarOpen} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70"><IconFolder size={14} className="mr-1 inline"/>{mobileSidebarOpen?"Hide navigation":"Project navigation"}</button><span className="min-w-0 flex-1 truncate text-[10px] text-white/35">{project?.name||"No active project"}</span></div>
        <div className="grid min-w-0 gap-4 py-4 sm:gap-5 sm:py-6 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${mobileSidebarOpen?"block":"hidden"} min-w-0 space-y-4 lg:block`}>
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-3">
              <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Your projects</h2><IconFolder size={15} className="text-white/40"/></div>
              {projects.length ? <div className="space-y-1">{projects.map(p=><div key={p.id} className={`group flex items-center gap-1 rounded-lg ${project?.id===p.id?"bg-violet-300/10":"hover:bg-white/[.04]"}`}><button onClick={()=>{setProject(p);setSelectedShot(p.shots[0]?.id??"");setNotice("Project opened from this device.")}} className="min-w-0 flex-1 px-2.5 py-2 text-left"><span className="block truncate text-xs font-medium">{p.name}</span><span className="mt-1 block text-[10px] text-white/35">{p.assets.length} pages · {p.shots.length} shots</span></button><button title="Delete project" onClick={()=>void removeProject(p.id)} className="mr-1 rounded p-1 text-white/25 opacity-0 hover:text-red-200 group-hover:opacity-100"><IconTrash size={13}/></button></div>)}</div>:<p className="px-2 py-3 text-xs leading-5 text-white/35">No saved projects yet. Create one to start.</p>}
              <button onClick={()=>void createProject()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-2 text-xs text-white/55 hover:border-violet-200/40 hover:text-white"><IconPlus size={14}/> Create project</button>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-3">
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-white/45">Project setup</h2>
              {project ? <div className="space-y-3">
                <label className="block text-xs text-white/55">Project name<input value={project.name} onChange={e=>updateProject({name:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white outline-none focus:border-violet-200/50"/></label>
                <label className="block text-xs text-white/55">Dialogue language<select value={project.language} onChange={e=>updateProject({language:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#11131b] px-2.5 py-2 text-sm text-white"><option value="hi">Hindi</option><option value="en">English (India)</option><option value="hinglish">Hinglish</option></select></label>
                <label className="block text-xs text-white/55">Video ratio<select value={project.aspect} onChange={e=>updateProject({aspect:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#11131b] px-2.5 py-2 text-sm text-white"><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
                <label className="block text-xs text-white/55">Reading direction<select value={project.direction} onChange={e=>updateProject({direction:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#11131b] px-2.5 py-2 text-sm text-white"><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
              </div>:<p className="text-xs text-white/35">Select or create a project to edit settings.</p>}
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-3">
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-white/45">Engine status</h2>
              <div className="space-y-2 text-xs"><Status label="Local project storage" state="Ready"/><Status label="Panel detection" state="OpenCV contours"/><Status label="OCR" state="Tesseract.js"/><Status label="System voice preview" state={typeof window!=="undefined"&&"speechSynthesis" in window?"Available":"Browser dependent"}/><Status label="AI provider" state="Configure in AI tab"/><Status label="Video render" state="Local FFmpeg worker"/></div>
            </section>
          </aside>

          <section className="min-w-0 space-y-4 sm:space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-200/70">Studio dashboard / Prototype</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{project?.name??"Create a local project"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">Import page images, review panel candidates, edit dialogue and timing, then render a local motion-comic. Project assets stay in this browser’s IndexedDB.</p></div>
              {project&&<div className="flex flex-wrap gap-2"><button onClick={()=>void exportProject()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05] disabled:opacity-40"><IconDownload size={14}/> Full project backup</button><button onClick={()=>restoreInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05] disabled:opacity-40"><IconRefresh size={14}/> Restore project</button><input ref={restoreInput} type="file" accept=".indica.json,application/json" className="hidden" onChange={e=>void restoreProject(e.currentTarget.files?.[0]??null)}/><button onClick={exportAssets} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05] disabled:opacity-40"><IconDownload size={14}/> Assets</button></div>}
            </div>

            {notice&&<div role="status" className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-white/65"><IconCheck size={15} className="mt-0.5 shrink-0 text-emerald-200"/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss message" className="ml-auto text-white/35"><IconX size={14}/></button></div>}

            {!project ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[.02] p-8 text-center"><IconBook2 size={35} className="text-violet-200"/><h2 className="mt-4 text-lg font-semibold">Start your first episode</h2><p className="mt-2 max-w-md text-sm leading-6 text-white/45">Create a project. It will be saved in this browser and will not appear on other devices unless you export and transfer it.</p><button onClick={()=>void createProject()} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black">Create local project</button></div>:<>
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Source pages" value={project.assets.length.toString()}/><Metric label="Timeline shots" value={project.shots.length.toString()}/><Metric label="Runtime" value={fmt(duration)}/><Metric label="Local assets" value={`${(totalBytes/1024/1024).toFixed(1)} MB`}/>
              </div>
              <div onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={()=>setIsDragging(false)} onDrop={e=>{e.preventDefault();setIsDragging(false);void importFiles(e.dataTransfer.files)}} className={`rounded-2xl border border-dashed p-5 transition ${isDragging?"border-violet-200 bg-violet-200/[.06]":"border-white/15 bg-white/[.02]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-100"><IconBook2 size={20}/></span><div><h2 className="text-sm font-semibold">Import comic pages</h2><p className="mt-1 text-xs text-white/40">JPG, PNG, WEBP, PDF or MP4/MOV/WEBM · up to {MAX_COMIC_FILES} pages/frames / 500 MB</p></div></div><button disabled={busy} onClick={()=>fileInput.current?.click()} className="rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-40">{busy?"Working…":"Choose images"}</button></div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm,video/quicktime,.mov,.m4v" multiple className="hidden" onChange={e=>{void importFiles(e.currentTarget.files);e.currentTarget.value=""}}/>
              </div>

              <div className="flex flex-col items-stretch justify-between gap-3 border-b border-white/10 pb-3 sm:flex-row sm:items-center">
                <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[.025] p-1 sm:flex sm:w-auto sm:flex-wrap">{(["assets","storyboard","dialogue","ai","export"] as const).map(tab=><button key={tab} onClick={()=>{setActiveTab(tab);setMobileSidebarOpen(false)}} className={`min-w-0 rounded-lg px-2 py-2.5 text-xs capitalize sm:px-3 sm:py-2 ${activeTab===tab?"bg-violet-300/15 text-violet-100":"text-white/45 hover:text-white"}`}>{tab}</button>)}</div>
                <div className="flex flex-wrap gap-2"><button disabled={busy||!project.assets.length} onClick={()=>void rectifyAssets()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 disabled:opacity-40">Rectify pages</button><button disabled={busy||!project.assets.length} onClick={()=>void detectPanels()} className="rounded-lg border border-violet-200/20 px-3 py-2 text-xs text-violet-100 disabled:opacity-40"><IconRefresh size={14} className="mr-1 inline"/> Detect panels</button><button disabled={busy||!project.shots.length} onClick={()=>void runOcr()} className="rounded-lg border border-cyan-200/20 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40">Run OCR</button></div>
              </div>

              {activeTab==="assets"&&<div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Source asset library</h2><p className="mt-1 text-xs text-white/40">Original image files stored in this browser’s IndexedDB.</p></div><button onClick={()=>fileInput.current?.click()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05]"><IconPlus size={14} className="mr-1 inline"/> Add assets</button></div>{project.assets.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{project.assets.map((asset,index)=><AssetCard key={asset.id} asset={asset} index={index} onRemove={()=>updateProject({assets:project.assets.filter(a=>a.id!==asset.id),shots:project.shots.filter(s=>s.assetId!==asset.id)})}/>)}</div>:<Empty text="No source assets yet. Import comic page images above."/>}</div>}

              {activeTab==="ai"&&<div className="space-y-4">
                <div className="rounded-2xl border border-violet-200/15 bg-gradient-to-br from-violet-300/[.08] via-white/[.025] to-cyan-200/[.04] p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-violet-200/70">Inference routing</p><h2 className="mt-1 text-lg font-semibold">Choose where your model runs</h2><p className="mt-1 text-xs leading-5 text-white/45">Hosted provider requests go through the app API. Local GGUF prompts go only to the local companion worker.</p></div><div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1"><button onClick={()=>setProviderMode("hosted")} className={`rounded-lg px-4 py-2.5 text-xs font-semibold ${providerMode==="hosted"?"bg-white text-black":"text-white/50"}`}>Hosted API</button><button onClick={()=>setProviderMode("local")} className={`rounded-lg px-4 py-2.5 text-xs font-semibold ${providerMode==="local"?"bg-violet-200 text-black":"text-white/50"}`}>Local GGUF</button></div></div>
                </div>
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
                  {providerMode==="hosted"?<><h2 className="text-lg font-semibold">Connect a vision-capable LLM</h2>
                  <p className="mt-2 text-sm leading-6 text-white/45">Use an OpenAI-compatible chat-completions endpoint that accepts image_url content. Works with compatible hosted endpoints and gateways; image generation additionally requires an OpenAI-compatible Images API.</p>
                  {providerMode==="hosted"&&<div className="mt-4 space-y-3">
                    <label className="block text-xs text-white/55">API base URL<input value={providerBaseUrl} onChange={e=>setProviderBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/50"/></label>
                    <label className="block text-xs text-white/55">Vision / chat model<input value={providerModel} onChange={e=>setProviderModel(e.target.value)} placeholder="gpt-4o-mini" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/50"/></label>
                    <label className="block text-xs text-white/55">API key (memory only)<input type="password" autoComplete="off" value={providerKey} onChange={e=>setProviderKey(e.target.value)} placeholder="Paste provider key for this session" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/50"/></label>
                    <div className="rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs leading-5 text-amber-100/65">The key is not saved to IndexedDB or localStorage. It is sent over HTTPS to this app’s server endpoint for the provider request, then forwarded to your configured HTTPS provider. Use a restricted key with usage limits. Do not use this on a shared computer.</div>
                    <button disabled={providerBusy||providerMode!=="hosted"||!providerKey.trim()||!providerModel.trim()||!providerBaseUrl.trim()} onClick={()=>void analyzeCurrentPage()} className="w-full rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-40">Analyze selected panel with hosted vision</button>
                    <button disabled={providerBusy||!project?.shots.length||(providerMode==="hosted"&&!providerKey.trim())||(providerMode==="local"&&!localWorkerToken.trim())} onClick={()=>void generateScenePlan()} className="w-full rounded-lg border border-violet-200/25 px-3 py-2.5 text-sm text-violet-100 disabled:opacity-40">{providerMode==="local"?"Generate scene plan locally":"Generate scene plan & prompts"}</button>
                    {providerMode==="hosted"&&<button disabled={providerBusy||!providerResult.trim()||!providerKey.trim()} onClick={()=>void generateImage()} className="w-full rounded-lg border border-cyan-200/25 px-3 py-2.5 text-sm text-cyan-100 disabled:opacity-40">Generate image from result (if supported)</button>}
                    <p className="text-[10px] leading-5 text-white/35">Local OCR and panel detection remain available without a provider, but their processing engines are loaded on demand from public CDNs. A hosted Vercel server cannot directly call your laptop’s localhost LLM endpoint.</p>
                  </div>}
                  {providerMode==="local"&&<div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-violet-200/15 bg-violet-200/[.04] p-3 text-xs leading-5 text-violet-100/75">Select a local .gguf model. The browser sends only its file path to the local worker; the model bytes never leave your computer. The first model load may take several minutes and use substantial RAM/VRAM.</div>
                    <div className="grid grid-cols-2 gap-2"><button onClick={()=>localModelInput.current?.click()} className="rounded-lg border border-white/10 px-3 py-2.5 text-xs font-medium hover:bg-white/[.05]">Choose local GGUF…</button><button onClick={()=>void pollLocalGguf()} disabled={providerBusy||!localWorkerToken.trim()} className="rounded-lg border border-white/10 px-3 py-2.5 text-xs disabled:opacity-40">Check model status</button><input ref={localModelInput} type="file" accept=".gguf,application/octet-stream" className="hidden" onChange={e=>{const file=e.currentTarget.files?.[0];if(file){const nativePath=(file as File&{path?:string}).path;if(nativePath){setLocalModelPath(nativePath);setLocalModelName(file.name);setLocalModelStatus(`Selected: ${file.name}`);setNotice(`Selected local model ${file.name}. Only the path is sent to the local worker.`)}else{setLocalModelPath("");setLocalModelStatus("Browser did not expose a local file path");setNotice("This browser exposes file contents but not the native path. Run the local studio app on this machine, or manually enter the model path in the field below; the GGUF file itself is never uploaded.")}}e.currentTarget.value=""}}/></div>
                    <label className="block text-xs text-white/55">Local .gguf file path<input value={localModelPath} onChange={e=>{setLocalModelPath(e.target.value);setLocalModelName(e.target.value.split(/[\\/]/).pop()||"")}} placeholder="C:\\Models\\your-model.gguf or /models/model.gguf" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/50"/></label>
                    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-white/55">Context window<input type="number" min={512} max={16384} step={512} value={localContext} onChange={e=>setLocalContext(Math.max(512,Math.min(16384,Number(e.target.value)||4096)))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/></label><label className="block text-xs text-white/55">GPU layers (-1 = auto)<input type="number" min={-1} max={999} value={localGpuLayers} onChange={e=>setLocalGpuLayers(Math.max(-1,Math.min(999,Number(e.target.value)||0)))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/></label></div>
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3"><p className="text-xs font-medium text-white/80">{localModelStatus}</p><p className="mt-1 text-[10px] leading-5 text-white/40">Worker: {localWorkerUrl} · {localWorkerStatus}</p></div>
                    <button disabled={providerBusy||!localWorkerToken.trim()||!localModelPath.trim()} onClick={()=>void loadLocalGguf()} className="w-full rounded-lg bg-violet-200 px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{providerBusy?"Loading…":"Load GGUF with llama.cpp"}</button>
                    <button disabled={providerBusy||!localWorkerToken.trim()} onClick={()=>void unloadLocalGguf()} className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-xs text-white/60 disabled:opacity-40">Unload local model</button>
                    <button disabled={providerBusy||!project?.shots.length} onClick={()=>void generateScenePlan()} className="w-full rounded-lg border border-violet-200/25 px-3 py-2.5 text-sm text-violet-100 disabled:opacity-40">Generate scene plan locally</button>
                    <p className="text-[10px] leading-5 text-white/35">llama.cpp must be installed with llama-server available on PATH. This adapter is text-only; vision analysis and image generation remain separate capabilities and will not silently fall back to a hosted API.</p>
                  </div>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Analysis & generation output</h2><div className="flex gap-2"><button disabled={!providerResult} onClick={()=>downloadBlob(new Blob([providerResult],{type:"text/plain;charset=utf-8"}),`${safeName(project?.name??"indica")}-ai-output.txt`)} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"><IconDownload size={14} className="mr-1 inline"/> Save output</button><button disabled={!providerResult} onClick={()=>GenUICopy(providerResult)} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">Copy output</button><button disabled={!activeShot||!providerResult} onClick={applyVisionDialogue} className="rounded-lg border border-violet-200/20 px-3 py-2 text-xs text-violet-100 disabled:opacity-40">Apply dialogue</button></div></div>
                  {providerImage&&<div className="mt-4">{providerImage.startsWith("data:image/")?<img src={providerImage} alt="AI-generated image" className="max-h-[420px] w-full rounded-xl object-contain"/>:<a href={providerImage} target="_blank" rel="noreferrer" className="text-sm text-violet-200 underline">Open generated image from provider</a>}<button onClick={()=>{if(providerImage.startsWith("data:"))downloadBlob(new Blob([Uint8Array.from(atob(providerImage.split(",")[1]),c=>c.charCodeAt(0))],{type:"image/png"}),`${safeName(project?.name??"indica")}-generated.png`);else window.open(providerImage,"_blank","noopener,noreferrer")}} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs">Save generated image</button></div>}
                  {providerResult?<pre className="mt-4 max-h-[650px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-white/75">{providerResult}</pre>:<Empty text="Connect your provider, select a shot, and run vision analysis. The result appears here; scene prompts can then be sent to a compatible image-generation endpoint."/>}
                </div>
                </div>
              </div>}
              {activeTab==="storyboard"&&<div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Shot sequence</h2><span className="text-[10px] text-white/35">Select a shot to edit</span></div>
                  {project.shots.length?<div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{project.shots.map((shot,index)=>{const asset=project.assets.find(a=>a.id===shot.assetId);return <ShotCard key={shot.id} shot={shot} index={index} selected={activeShot?.id===shot.id} asset={asset} onSelect={()=>setSelectedShot(shot.id)} onMove={delta=>moveShot(shot.id,delta)} onRemove={()=>updateProject({shots:project.shots.filter(s=>s.id!==shot.id)})}/>})}</div>:<Empty text="Import page images to create the first shots."/>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <h2 className="text-sm font-semibold">Shot inspector</h2>
                  {activeShot?<ShotEditor shot={activeShot} onChange={patch=>updateShot(activeShot.id,patch)} onSpeak={speakDialogue}/>:<Empty text="Select a shot to edit dialogue and timing."/>}
                </div>
              </div>}

              {activeTab==="dialogue"&&<div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Dialogue & subtitles</h2><button onClick={exportSrt} disabled={!project.shots.length} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"><IconDownload size={14} className="mr-1 inline"/> Export SRT</button></div>{project.shots.length?<div className="space-y-3">{project.shots.map((shot,index)=><div key={shot.id} className="grid gap-3 rounded-xl border border-white/10 p-3 md:grid-cols-[100px_1fr_1fr]"><div><div className="text-xs font-medium">Shot {index+1}</div><div className="mt-1 text-[10px] text-white/35">{fmt(shot.start)} → {fmt(shot.start+shot.duration)}</div></div><label className="text-[10px] text-white/40">Speaker<input value={shot.speaker} onChange={e=>updateShot(shot.id,{speaker:e.target.value})} placeholder="Speaker name" className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white outline-none"/></label><label className="text-[10px] text-white/40">Dialogue / subtitle<textarea value={shot.dialogue} onChange={e=>updateShot(shot.id,{dialogue:e.target.value})} rows={2} placeholder="Enter dialogue manually or use Run OCR / AI vision." className="mt-1 block w-full resize-y rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white outline-none focus:border-violet-200/40"/></label></div>)}</div>:<Empty text="Add source pages to start dialogue editing."/>}</div>}

              {activeTab==="export"&&<div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><IconMovie size={22} className="text-violet-200"/><h2 className="mt-3 text-lg font-semibold">Local FFmpeg + TTS render</h2><p className="mt-2 text-sm leading-6 text-white/45">The companion service on this computer renders frame-count-based H.264 MP4 at 24 fps, generates a synchronized voice track with Piper when configured, and exports subtitles and a manifest in one ZIP. No browser MediaRecorder fallback is used.</p><div className="mt-4 space-y-3"><label className="block text-xs text-white/55">Local worker URL<input value={localWorkerUrl} onChange={e=>setLocalWorkerUrl(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none"/></label><label className="block text-xs text-white/55">Worker token (session only)<input type="password" autoComplete="off" value={localWorkerToken} onChange={e=>setLocalWorkerToken(e.target.value)} placeholder="Paste token printed by local worker" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none"/></label><div className="flex flex-wrap items-center gap-2"><button disabled={busy} onClick={()=>void checkLocalWorker()} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">Check local worker</button><span className="text-xs text-white/45">{localWorkerStatus}</span></div><button disabled={busy||!project.shots.length||!localWorkerToken.trim()} onClick={()=>void renderVideo()} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"><IconPlayerPlay size={16} className="mr-1 inline"/>{busy?"Rendering…":"Render MP4 + audio bundle"}</button><button onClick={exportSrt} disabled={!project.shots.length} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 disabled:opacity-40">Export SRT separately</button></div>{busy&&<div className="mt-4"><div className="mb-1 flex justify-between text-xs text-white/40"><span>Preparing assets / rendering</span><span>{renderProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-300 transition-all" style={{width:`${renderProgress}%`}}/></div></div>}<div className="mt-4 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs leading-5 text-amber-100/65">Start the local worker with <code>python scripts/indica_local_worker.py</code>. Configure FFmpeg and a Piper ONNX voice model for speech; if Piper is not configured, the exported audio track is silence. The token is not saved in the project.</div></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><IconSettings size={22} className="text-cyan-200"/><h2 className="mt-3 text-lg font-semibold">Export & portability</h2><p className="mt-2 text-sm leading-6 text-white/45">Back up and restore the editable project, export original assets and SRT, or download the local render bundle containing the MP4, synchronized WAV voice track, subtitle file and render manifest.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>void exportProject()} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Full project backup</button><button onClick={exportAssets} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Download assets</button><button onClick={exportSrt} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Subtitles SRT</button></div><div className="mt-4 rounded-lg border border-white/10 p-3 text-xs leading-5 text-white/45">The hosted app cannot install FFmpeg or voice models on your device. The companion worker binds to loopback, requires a per-run token, and accepts requests only from local development or Vercel origins.</div></div></div>}
            </>}
          </section>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-4 text-[10px] text-white/30"><span>Indica Anime Us · Browser-local prototype</span><span>Local storage is per browser and device · export backups regularly</span></footer>
      </div>
    </main>
  )
}

function GenUICopy(value:string) { void navigator.clipboard?.writeText(value) }
function Status({label,state}:{label:string;state:string}) { return <div className="flex items-center justify-between gap-2"><span className="text-white/45">{label}</span><span className="text-right text-[10px] text-emerald-100/65">{state}</span></div> }
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-xl border border-white/10 bg-white/[.025] p-3"><div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div> }
function Empty({text}:{text:string}) { return <div className="rounded-xl border border-dashed border-white/10 p-7 text-center text-xs leading-5 text-white/35">{text}</div> }
function AssetCard({asset,index,onRemove}:{asset:Asset;index:number;onRemove:()=>void}) {
  const [src,setSrc] = useState("")
  useEffect(()=>{const url=URL.createObjectURL(asset.blob);setSrc(url);return()=>URL.revokeObjectURL(url)},[asset])
  return <article className="overflow-hidden rounded-xl border border-white/10 bg-black/10"><div className="flex aspect-video items-center justify-center bg-[#090a10]">{src?<img src={src} alt={asset.name} className="h-full w-full object-contain"/>:<IconBook2 size={24} className="text-white/20"/>}</div><div className="p-3"><div className="truncate text-xs font-medium">{index+1}. {asset.name}</div><div className="mt-1 text-[10px] text-white/35">{(asset.size/1024/1024).toFixed(2)} MB</div><button onClick={onRemove} className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs text-white/55 hover:border-red-200/25 hover:text-red-100">Remove asset & linked shots</button></div></article>
}
function ShotCard({shot,index,selected,asset,onSelect,onMove,onRemove}:{shot:Shot;index:number;selected:boolean;asset?:Asset;onSelect:()=>void;onMove:(delta:number)=>void;onRemove:()=>void}) {
  const [src,setSrc] = useState("")
  useEffect(()=>{if(!asset){setSrc("");return}const next=URL.createObjectURL(asset.blob);setSrc(next);return()=>URL.revokeObjectURL(next)},[asset])
  return <article className={`overflow-hidden rounded-xl border ${selected?"border-violet-200/50 bg-violet-200/[.05]":"border-white/10 bg-black/10"}`}><button onClick={onSelect} className="block w-full text-left"><div className="flex aspect-video items-center justify-center bg-[#090a10]">{src?<img src={src} alt={asset?.name??shot.title} className="h-full w-full object-contain"/>:<IconBook2 size={26} className="text-white/20"/>}</div><div className="p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">{index+1}. {shot.title}</span><span className="shrink-0 text-[10px] text-white/35">{shot.duration.toFixed(1)}s</span></div><p className="mt-1 line-clamp-2 text-[10px] text-white/40">{shot.dialogue||"No dialogue yet"}</p></div></button><div className="flex items-center justify-between border-t border-white/10 px-2 py-1.5"><span className="text-[10px] text-white/35">{fmt(shot.start)} start</span><div className="flex"><button onClick={()=>onMove(-1)} aria-label="Move shot up" className="rounded p-1 text-white/45 hover:bg-white/10"><IconChevronUp size={14}/></button><button onClick={()=>onMove(1)} aria-label="Move shot down" className="rounded p-1 text-white/45 hover:bg-white/10"><IconChevronDown size={14}/></button><button onClick={onRemove} aria-label="Remove shot" className="rounded p-1 text-white/35 hover:text-red-200"><IconTrash size={14}/></button></div></div></article>
}
function ShotEditor({shot,onChange,onSpeak}:{shot:Shot;onChange:(patch:Partial<Shot>)=>void;onSpeak:()=>void}) {
  return <div className="mt-4 space-y-4"><label className="block text-xs text-white/45">Shot title<input value={shot.title} onChange={e=>onChange({title:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/40"/></label><label className="block text-xs text-white/45">Speaker<input value={shot.speaker} onChange={e=>onChange({speaker:e.target.value})} placeholder="Speaker name" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-200/40"/></label><label className="block text-xs text-white/45">Dialogue / subtitle<textarea value={shot.dialogue} onChange={e=>onChange({dialogue:e.target.value})} rows={4} placeholder="Enter dialogue manually. OCR engine is not configured in this prototype." className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-violet-200/40"/></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-white/45">Start (seconds)<input type="number" min={0} step={0.25} value={shot.start} onChange={e=>onChange({start:Math.max(0,Number(e.target.value)||0)})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/></label><label className="text-xs text-white/45">Duration (seconds)<input type="number" min={0.5} max={60} step={0.5} value={shot.duration} onChange={e=>onChange({duration:Math.max(0.5,Math.min(60,Number(e.target.value)||3))})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white"/></label></div><label className="block text-xs text-white/45">Zoom end<input type="range" min={1} max={1.35} step={0.01} value={shot.zoom} onChange={e=>onChange({zoom:Number(e.target.value)})} className="mt-2 w-full accent-violet-300"/><span className="block text-right text-[10px]">{shot.zoom.toFixed(2)}×</span></label><button onClick={onSpeak} className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-xs text-white/70 hover:bg-white/[.05]"><IconVolume size={15} className="mr-1 inline"/> Preview system voice</button><p className="text-[10px] leading-5 text-white/35">Voice uses the browser’s installed speech engine. It is not saved as an audio track.</p></div>
}
