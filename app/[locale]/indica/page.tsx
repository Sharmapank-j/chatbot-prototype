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
  const [activeTab, setActiveTab] = useState<"assets"|"storyboard"|"dialogue"|"export">("storyboard")
  const [renderProgress, setRenderProgress] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const audioContext = useRef<AudioContext | null>(null)
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
    const pdfs = files.filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    const rejected = files.filter(f => !images.includes(f) && !pdfs.includes(f))
    if (rejected.length) setNotice(`${rejected.length} unsupported file(s) skipped. Use JPG, PNG, WEBP or PDF.`)
    if (pdfs.length) setNotice("PDFs are recognized but page extraction is not included in this prototype yet. Export pages as PNG/JPG and import them with the image files.")
    const existing = new Set(project.assets.map(a => `${a.name}:${a.size}`))
    const fresh = images.filter(f => !existing.has(`${f.name}:${f.size}`))
    if (project.assets.length + fresh.length > MAX_COMIC_FILES) { setNotice(`Project limit is ${MAX_COMIC_FILES} images.`); return }
    if (project.assets.reduce((n,a)=>n+a.size,0) + fresh.reduce((n,f)=>n+f.size,0) > MAX_COMIC_BATCH_BYTES) { setNotice("Project limit is 500 MB total. Remove assets before importing more."); return }
    if (!fresh.length) { if (!pdfs.length && !rejected.length) setNotice("No new image files to add."); return }
    setBusy(true)
    const assets: Asset[] = fresh.map(f => ({ id: newId(), name: f.name, type: f.type, size: f.size, blob: f }))
    const newShots: Shot[] = assets.map((asset, index) => ({
      id: newId(), assetId: asset.id, title: `Shot ${project.shots.length + index + 1}`,
      dialogue: "", speaker: "", start: project.shots.reduce((n,s)=>Math.max(n,s.start+s.duration),0) + assets.slice(0,index).length*3,
      duration: 3, zoom: 1.08
    }))
    const next = { ...project, assets: [...project.assets, ...assets], shots: [...project.shots, ...newShots], updatedAt: Date.now() }
    setProject(next)
    if (!selectedShot && newShots[0]) setSelectedShot(newShots[0].id)
    setBusy(false)
    setNotice(`${fresh.length} page image(s) imported into the local project. Dialogue and timing are editable.`)
  }

  async function detectPanels() {
    if (!project) return
    const candidates: Shot[] = []
    setBusy(true)
    for (const asset of project.assets) {
      if (!asset.type.startsWith("image/")) continue
      try {
        const url = URL.createObjectURL(asset.blob)
        const image = new Image()
        image.src = url
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image decode failed")) })
        const panels = detectGutterPanels(image)
        URL.revokeObjectURL(url)
        const old = project.shots.filter(s => s.assetId === asset.id)
        if (panels.length > 1) {
          const baseStart = old[0]?.start ?? 0
          const each = old.length ? old[0].duration / panels.length : 3 / panels.length
          panels.forEach((panel, index) => candidates.push({
            id: newId(), assetId: asset.id, title: `Panel ${index+1} · ${asset.name}`,
            dialogue: old[index]?.dialogue ?? "", speaker: old[index]?.speaker ?? "",
            start: baseStart + each*index, duration: each, zoom: 1.04, crop: panel,
          }))
        } else {
          candidates.push(...(old.length ? old : [{id:newId(),assetId:asset.id,title:asset.name,dialogue:"",speaker:"",start:candidates.length*3,duration:3,zoom:1.05}]))
        }
      } catch {
        setNotice(`Could not inspect ${asset.name}; kept it as a single shot.`)
      }
    }
    if (candidates.length) {
      let cursor = 0
      const ordered = candidates.map(s => { const next = { ...s, start: cursor }; cursor += s.duration; return next })
      updateProject({ shots: ordered })
      setSelectedShot(ordered[0].id)
      setNotice("Panel heuristic complete. Review every candidate; white-gutter detection can miss panels or split artwork incorrectly.")
    } else setNotice("Import page images first.")
    setBusy(false)
  }

  function exportProject() {
    if (!project) return
    const { assets, ...manifest } = project
    const json = { ...manifest, assets: assets.map(({blob, ...asset}) => asset), formatVersion: 1 }
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], {type:"application/json"}), `${safeName(project.name)}.indica.json`)
    setNotice("Project manifest exported. Asset files are stored separately in this browser; use Export assets to back them up.")
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
  async function renderVideo() {
    if (!project || !project.shots.length || !previewCanvas.current) { setNotice("Import at least one image to render a video."); return }
    const canvas = previewCanvas.current
    const ctx = canvas.getContext("2d")
    if (!ctx) { setNotice("Canvas rendering is not available."); return }
    const supportsMp4 = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4")
    const mimeType = supportsMp4 ? "video/mp4" : "video/webm"
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) { setNotice("This browser does not support local video recording."); return }
    setBusy(true); setRenderProgress(0)
    const width = project.aspect === "9:16" ? 720 : project.aspect === "1:1" ? 900 : 1280
    const height = project.aspect === "9:16" ? 1280 : project.aspect === "1:1" ? 900 : 720
    canvas.width = width; canvas.height = height
    const stream = canvas.captureStream(24)
    let recorder: MediaRecorder
    try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 }) }
    catch { recorder = new MediaRecorder(stream) }
    const chunks: BlobPart[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      recorder.onerror = () => reject(new Error("Browser video encoder failed"))
      recorder.onstop = () => resolve(new Blob(chunks, {type:recorder.mimeType || mimeType}))
    })
    recorder.start(250)
    const loadImage = async (asset: Asset) => {
      const url = URL.createObjectURL(asset.blob)
      const image = new Image(); image.src = url
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Unable to load image"))})
      return {image,url}
    }
    try {
      for (let i=0;i<project.shots.length;i++) {
        const shot = project.shots[i]
        const asset = project.assets.find(a=>a.id===shot.assetId)
        if (!asset) continue
        const {image,url} = await loadImage(asset)
        const frames = Math.max(12, Math.round(shot.duration*24))
        for (let frame=0;frame<frames;frame++) {
          const p = frame/frames
          const zoom = 1 + (shot.zoom-1)*p
          ctx.fillStyle="#08090d"; ctx.fillRect(0,0,width,height)
          const crop = shot.crop ?? {x:0,y:0,w:1,h:1}
          const sx = crop.x * image.naturalWidth, sy = crop.y * image.naturalHeight
          const sw = crop.w * image.naturalWidth, sh = crop.h * image.naturalHeight
          const fit = Math.min(width/sw,height/sh)
          const w=sw*fit*zoom, h=sh*fit*zoom
          ctx.drawImage(image,sx,sy,sw,sh,(width-w)/2,(height-h)/2,w,h)
          if (shot.dialogue.trim()) {
            const boxH=Math.round(height*.16), margin=Math.round(width*.045)
            ctx.fillStyle="rgba(0,0,0,.76)"; ctx.fillRect(margin,height-boxH-margin,width-margin*2,boxH)
            ctx.fillStyle="#ffffff"; ctx.textAlign="center"; ctx.textBaseline="middle"
            ctx.font=`600 ${Math.max(20,Math.round(width*.025))}px system-ui, sans-serif`
            const words=shot.dialogue.split(/\s+/); const lines:string[]=[]; let line=""
            for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>width-margin*4&&line){lines.push(line);line=word}else line=test}
            if(line)lines.push(line)
            const shown=lines.slice(0,2), lineH=Math.round(height*.04), centerY=height-boxH/2-margin/2
            shown.forEach((text,j)=>ctx!.fillText(text,width/2,centerY+(j-(shown.length-1)/2)*lineH,width-margin*4))
          }
          if (frame % 6 === 0) setRenderProgress(Math.round((i+(frame/frames))/project.shots.length*100))
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
        }
        URL.revokeObjectURL(url)
      }
      await new Promise(resolve=>window.setTimeout(resolve,200))
      recorder.stop()
      const blob=await done
      const ext=blob.type.includes("mp4")?"mp4":"webm"
      downloadBlob(blob,`${safeName(project.name)}.${ext}`)
      setNotice(`Rendered ${Math.round(blob.size/1024/1024*10)/10} MB ${ext.toUpperCase()} motion-comic. ${ext==="webm"?"This browser did not expose MP4 recording; use FFmpeg to convert WebM to MP4.":""}`)
    } catch(error) {
      if (recorder.state!=="inactive") recorder.stop()
      setNotice(error instanceof Error?error.message:"Video rendering failed.")
    } finally {
      stream.getTracks().forEach(track=>track.stop())
      setBusy(false);setRenderProgress(100)
    }
  }
  function safeName(name:string) { return name.trim().replace(/[^a-z0-9-_]+/gi,"-").replace(/^-|-$/g,"").slice(0,60)||"indica-project" }

  return (
    <main className="min-h-screen bg-[#08090d] text-white">
      <canvas ref={previewCanvas} className="pointer-events-none fixed -left-[2000px] top-0" aria-hidden="true" />
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back home" className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-white"><IconArrowLeft size={18}/></Link>
            <div><div className="text-sm font-semibold tracking-wide">INDICA <span className="text-violet-200">ANIME US</span></div><div className="text-xs text-white/40">Local-first studio · Prototype dashboard</div></div>
          </div>
          <div className="flex items-center gap-2 text-xs"><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-1.5 text-emerald-200"><IconShieldLock size={13} className="mr-1 inline"/> Device storage</span><button onClick={()=>void createProject()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-semibold text-black hover:bg-violet-100"><IconPlus size={15}/> New project</button></div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-4">
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
              <div className="space-y-2 text-xs"><Status label="Local project storage" state="Ready"/><Status label="Panel detection" state="Heuristic"/><Status label="OCR" state="Manual fallback"/><Status label="System voice preview" state={typeof window!=="undefined"&&"speechSynthesis" in window?"Available":"Browser dependent"}/><Status label="AI provider" state="Not connected"/><Status label="Video render" state="Browser encoder"/></div>
            </section>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-violet-200/70">Studio dashboard / Prototype</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{project?.name??"Create a local project"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">Import page images, review panel candidates, edit dialogue and timing, then render a local motion-comic. Project assets stay in this browser’s IndexedDB.</p></div>
              {project&&<div className="flex flex-wrap gap-2"><button onClick={exportProject} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05]"><IconDownload size={14}/> Project JSON</button><button onClick={exportAssets} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05]"><IconDownload size={14}/> Assets</button></div>}
            </div>

            {notice&&<div role="status" className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5 text-xs leading-5 text-white/65"><IconCheck size={15} className="mt-0.5 shrink-0 text-emerald-200"/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss message" className="ml-auto text-white/35"><IconX size={14}/></button></div>}

            {!project ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[.02] p-8 text-center"><IconBook2 size={35} className="text-violet-200"/><h2 className="mt-4 text-lg font-semibold">Start your first episode</h2><p className="mt-2 max-w-md text-sm leading-6 text-white/45">Create a project. It will be saved in this browser and will not appear on other devices unless you export and transfer it.</p><button onClick={()=>void createProject()} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black">Create local project</button></div>:<>
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Source pages" value={project.assets.length.toString()}/><Metric label="Timeline shots" value={project.shots.length.toString()}/><Metric label="Runtime" value={fmt(duration)}/><Metric label="Local assets" value={`${(totalBytes/1024/1024).toFixed(1)} MB`}/>
              </div>
              <div onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={()=>setIsDragging(false)} onDrop={e=>{e.preventDefault();setIsDragging(false);void importFiles(e.dataTransfer.files)}} className={`rounded-2xl border border-dashed p-5 transition ${isDragging?"border-violet-200 bg-violet-200/[.06]":"border-white/15 bg-white/[.02]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-100"><IconBook2 size={20}/></span><div><h2 className="text-sm font-semibold">Import comic pages</h2><p className="mt-1 text-xs text-white/40">JPG, PNG, WEBP · up to {MAX_COMIC_FILES} images / 500 MB per project</p></div></div><button disabled={busy} onClick={()=>fileInput.current?.click()} className="rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-40">{busy?"Working…":"Choose images"}</button></div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={e=>{void importFiles(e.currentTarget.files);e.currentTarget.value=""}}/>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[.025] p-1">{(["assets","storyboard","dialogue","export"] as const).map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`rounded-md px-3 py-2 text-xs capitalize ${activeTab===tab?"bg-violet-300/15 text-violet-100":"text-white/45 hover:text-white"}`}>{tab}</button>)}</div>
                <div className="flex flex-wrap gap-2"><button disabled={busy||!project.assets.length} onClick={()=>void detectPanels()} className="rounded-lg border border-violet-200/20 px-3 py-2 text-xs text-violet-100 disabled:opacity-40"><IconRefresh size={14} className="mr-1 inline"/> Detect panels</button></div>
              </div>

              {activeTab==="assets"&&<div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">Source asset library</h2><p className="mt-1 text-xs text-white/40">Original image files stored in this browser’s IndexedDB.</p></div><button onClick={()=>fileInput.current?.click()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/[.05]"><IconPlus size={14} className="mr-1 inline"/> Add assets</button></div>{project.assets.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{project.assets.map((asset,index)=><AssetCard key={asset.id} asset={asset} index={index} onRemove={()=>updateProject({assets:project.assets.filter(a=>a.id!==asset.id),shots:project.shots.filter(s=>s.assetId!==asset.id)})}/>)}</div>:<Empty text="No source assets yet. Import comic page images above."/>}</div>}

              {activeTab==="storyboard"&&<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Shot sequence</h2><span className="text-[10px] text-white/35">Select a shot to edit</span></div>
                  {project.shots.length?<div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{project.shots.map((shot,index)=>{const asset=project.assets.find(a=>a.id===shot.assetId);return <ShotCard key={shot.id} shot={shot} index={index} selected={activeShot?.id===shot.id} asset={asset} onSelect={()=>setSelectedShot(shot.id)} onMove={delta=>moveShot(shot.id,delta)} onRemove={()=>updateProject({shots:project.shots.filter(s=>s.id!==shot.id)})}/>})}</div>:<Empty text="Import page images to create the first shots."/>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <h2 className="text-sm font-semibold">Shot inspector</h2>
                  {activeShot?<ShotEditor shot={activeShot} onChange={patch=>updateShot(activeShot.id,patch)} onSpeak={speakDialogue}/>:<Empty text="Select a shot to edit dialogue and timing."/>}
                </div>
              </div>}

              {activeTab==="dialogue"&&<div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Dialogue & subtitles</h2><button onClick={exportSrt} disabled={!project.shots.length} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40"><IconDownload size={14} className="mr-1 inline"/> Export SRT</button></div>{project.shots.length?<div className="space-y-3">{project.shots.map((shot,index)=><div key={shot.id} className="grid gap-3 rounded-xl border border-white/10 p-3 md:grid-cols-[100px_1fr_1fr]"><div><div className="text-xs font-medium">Shot {index+1}</div><div className="mt-1 text-[10px] text-white/35">{fmt(shot.start)} → {fmt(shot.start+shot.duration)}</div></div><label className="text-[10px] text-white/40">Speaker<input value={shot.speaker} onChange={e=>updateShot(shot.id,{speaker:e.target.value})} placeholder="Speaker name" className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white outline-none"/></label><label className="text-[10px] text-white/40">Dialogue / subtitle<textarea value={shot.dialogue} onChange={e=>updateShot(shot.id,{dialogue:e.target.value})} rows={2} placeholder="Type dialogue here. OCR is not connected in this prototype." className="mt-1 block w-full resize-y rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-white outline-none focus:border-violet-200/40"/></label></div>)}</div>:<Empty text="Add source pages to start dialogue editing."/>}</div>}

              {activeTab==="export"&&<div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><IconMovie size={22} className="text-violet-200"/><h2 className="mt-3 text-lg font-semibold">Motion-comic render</h2><p className="mt-2 text-sm leading-6 text-white/45">Builds a video locally from your shot sequence with gentle zoom, timed dialogue overlays and your selected aspect ratio. It does not call an AI provider.</p><div className="mt-5 flex flex-wrap gap-2"><button disabled={busy||!project.shots.length} onClick={()=>void renderVideo()} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"><IconPlayerPlay size={16} className="mr-1 inline"/>{busy?"Rendering…":"Render video"}</button><button onClick={exportSrt} disabled={!project.shots.length} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 disabled:opacity-40">Export SRT</button></div>{busy&&<div className="mt-4"><div className="mb-1 flex justify-between text-xs text-white/40"><span>Rendering frames</span><span>{renderProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-300 transition-all" style={{width:`${renderProgress}%`}}/></div></div>}</div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><IconSettings size={22} className="text-cyan-200"/><h2 className="mt-3 text-lg font-semibold">Export & portability</h2><p className="mt-2 text-sm leading-6 text-white/45">Export the editable project manifest, download original assets, or create an SRT subtitle file. Browser support decides whether the video recorder produces MP4 or WebM.</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={exportProject} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Project JSON</button><button onClick={exportAssets} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Download assets</button><button onClick={exportSrt} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Subtitles SRT</button></div><div className="mt-4 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs leading-5 text-amber-100/65">This public prototype stores files in the current browser only. Do not use private or sensitive source material on a shared computer. Neural OCR, model-backed voices and AI providers are not connected yet.</div></div></div>}
            </>}
          </section>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-4 text-[10px] text-white/30"><span>Indica Anime Us · Browser-local prototype</span><span>Local storage is per browser and device · export backups regularly</span></footer>
      </div>
    </main>
  )
}

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
