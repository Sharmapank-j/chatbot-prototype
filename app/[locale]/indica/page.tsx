"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { IconArrowLeft, IconBook2, IconCheck, IconFileTypePdf, IconMovie, IconPhoto, IconRefresh, IconShieldLock, IconVolume } from "@tabler/icons-react"
import Link from "next/link"
import { classifyComicFile, MAX_COMIC_BATCH_BYTES, MAX_COMIC_FILES } from "@/lib/indica/file-validation"

type ComicFile = { id: string; file: File; url: string; kind: "image" | "pdf" }

export default function IndicaWorkspacePage() {
  const [files, setFiles] = useState<ComicFile[]>([])
  const [language, setLanguage] = useState("hi")
  const [format, setFormat] = useState("16:9")
  const [readingDirection, setReadingDirection] = useState("ltr")
  const [mode, setMode] = useState("offline")
  const [notice, setNotice] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const objectUrls = useRef(new Set<string>())
  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])
  const totalBytes = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files])

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const next: ComicFile[] = []
    const issues: string[] = []
    const currentKeys = new Set(files.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
    const candidates = Array.from(list)
    const remainingSlots = Math.max(0, MAX_COMIC_FILES - files.length)
    if (candidates.length > remainingSlots) issues.push("Only " + MAX_COMIC_FILES + " source files are supported per project; " + remainingSlots + " slot(s) remain.")
    for (const file of candidates.slice(0, remainingSlots)) {
      const validation = classifyComicFile(file)
      if (!validation.kind) {
        issues.push(file.name + ": " + validation.error + ".")
        continue
      }
      const kind = validation.kind
      const key = `${file.name}:${file.size}:${file.lastModified}`
      if (currentKeys.has(key)) {
        issues.push(`${file.name}: duplicate selection skipped.`)
        continue
      }
      currentKeys.add(key)
      const url = URL.createObjectURL(file)
      objectUrls.current.add(url)
      next.push({ id: crypto.randomUUID(), file, url, kind })
    }
    const newTotal = files.reduce((sum, item) => sum + item.file.size, 0) + next.reduce((sum, item) => sum + item.file.size, 0)
    if (newTotal > MAX_COMIC_BATCH_BYTES) {
      next.forEach(item => { URL.revokeObjectURL(item.url); objectUrls.current.delete(item.url) })
      setNotice("Selection exceeds the 500 MB total project limit. Remove some files and try again.")
      return
    }
    if (next.length) setFiles(current => [...current, ...next])
    setNotice([
      next.length ? `${next.length} file(s) added to this browser session. No files have been uploaded.` : "",
      ...issues.slice(0, 3),
      issues.length > 3 ? `And ${issues.length - 3} more issue(s).` : ""
    ].filter(Boolean).join(" "))
  }

  function removeFile(id: string) {
    const found = files.find(file => file.id === id)
    if (found) {
      URL.revokeObjectURL(found.url)
      objectUrls.current.delete(found.url)
    }
    setFiles(current => current.filter(file => file.id !== id))
  }

  return (
    <main className="min-h-screen bg-[#08090d] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-white/10 p-2 text-white/65 hover:text-white" aria-label="Back to home"><IconArrowLeft size={18} /></Link>
            <div><div className="text-sm font-semibold">Indica Anime Us</div><div className="text-xs text-white/40">Comic project workspace</div></div>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs text-emerald-200">Offline-first · Local preview</span>
        </header>

        <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="mb-5 flex items-end justify-between gap-3">
              <div><p className="text-xs font-medium uppercase tracking-[.2em] text-violet-200/70">01 / Source pages</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Start from your comic</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">Choose a batch of comic images or a PDF. Files stay in browser memory for preview only; persistent local projects are not yet implemented.</p></div>
              <div className="hidden rounded-xl border border-white/10 bg-white/[.03] p-3 text-right sm:block"><div className="text-2xl font-semibold">{files.length.toString().padStart(2,"0")}</div><div className="text-[10px] uppercase tracking-widest text-white/40">Files selected</div></div>
            </div>

            <label onDragOver={event => { event.preventDefault(); setIsDragging(true) }} onDragLeave={event => { event.preventDefault(); setIsDragging(false) }} onDrop={event => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files) }} className={`group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${isDragging ? "border-violet-200 bg-violet-200/[.08]" : "border-violet-200/25 bg-gradient-to-br from-violet-300/[.06] via-white/[.02] to-cyan-300/[.03] hover:border-violet-200/50 hover:bg-violet-200/[.05]"}`}>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] text-violet-100"><IconBook2 size={25} /></span>
              <span className="text-base font-semibold">Drop comic pages here or browse files</span>
              <span className="mt-2 max-w-md text-xs leading-5 text-white/45">JPG, PNG, WEBP or PDF · up to 30 files · 100 MB each / 500 MB total</span>
              <span className="mt-5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">Choose source files</span>
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = "" }} />
            </label>

            {notice && <div role="status" className="mt-3 rounded-lg border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-white/65">{notice}</div>}

            {files.length > 0 ? (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Selected sources</h2><button type="button" onClick={() => { files.forEach(file => { URL.revokeObjectURL(file.url); objectUrls.current.delete(file.url) }); setFiles([]); setNotice("Source list cleared.") }} className="text-xs text-white/40 hover:text-white">Clear all</button></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {files.map((item, index) => <article key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.025]">
                    <div className="flex aspect-[4/3] items-center justify-center bg-[#11131b]">
                      {item.kind === "image" ? <img src={item.url} alt={item.file.name} className="h-full w-full object-contain" /> : <div className="text-center"><IconFileTypePdf className="mx-auto text-violet-200" size={36} /><div className="mt-2 text-xs text-white/60">PDF preview is not rendered in this browser draft</div></div>}
                    </div>
                    <div className="flex items-center gap-3 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[.05] text-white/60">{item.kind === "pdf" ? <IconFileTypePdf size={17} /> : <IconPhoto size={17} />}</span>
                      <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{index + 1}. {item.file.name}</div><div className="mt-1 text-[10px] text-white/40">{(item.file.size / 1024 / 1024).toFixed(2)} MB</div></div>
                      <button type="button" onClick={() => removeFile(item.id)} aria-label={`Remove ${item.file.name}`} className="rounded-md px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white">Remove</button>
                    </div>
                  </article>)}
                </div>
                <div className="mt-3 text-xs text-white/35">{files.length} source(s) · {(totalBytes / 1024 / 1024).toFixed(2)} MB selected · order follows selection order</div>
              </div>
            ) : <div className="mt-5 rounded-xl border border-white/10 bg-white/[.02] p-5 text-sm text-white/40">No sources selected yet. Start by adding a batch of pages.</div>}

            <div className="mt-8 border-t border-white/10 pt-7">
              <p className="text-xs font-medium uppercase tracking-[.2em] text-violet-200/70">02 / Episode settings</p>
              <h2 className="mt-2 text-xl font-semibold">Set up the first cut</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-2 block text-xs text-white/55">Dialogue and subtitle language</span><select value={language} onChange={e=>setLanguage(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#141620] px-3 py-3 text-sm outline-none focus:border-violet-200/40"><option value="hi">Hindi (Devanagari)</option><option value="en">English</option><option value="both">Hindi + English tracks</option><option value="hinglish">Hinglish</option></select></label>
                <label className="block"><span className="mb-2 block text-xs text-white/55">Video format</span><select value={format} onChange={e=>setFormat(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#141620] px-3 py-3 text-sm outline-none focus:border-violet-200/40"><option value="16:9">Landscape · 16:9</option><option value="9:16">Portrait · 9:16</option><option value="1:1">Square · 1:1</option></select></label>
                <label className="block"><span className="mb-2 block text-xs text-white/55">Reading direction</span><select value={readingDirection} onChange={e=>setReadingDirection(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#141620] px-3 py-3 text-sm outline-none focus:border-violet-200/40"><option value="ltr">Left to right</option><option value="rtl">Right to left (manga)</option><option value="vertical">Vertical / webtoon</option></select></label>
                <label className="block"><span className="mb-2 block text-xs text-white/55">Processing mode</span><select value={mode} onChange={e=>setMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#141620] px-3 py-3 text-sm outline-none focus:border-violet-200/40"><option value="offline">Strict offline (recommended)</option><option value="hybrid">Hybrid (cloud calls still need setup + consent)</option></select></label>
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3"><span className="mt-0.5 text-emerald-200"><IconShieldLock size={19}/></span><div><div className="text-sm font-medium">No upload or generation triggered</div><div className="mt-1 max-w-lg text-xs leading-5 text-white/45">This page currently selects and previews files in the browser. Panel detection, OCR, persistent local projects, TTS and MP4 rendering are not wired up yet.</div></div></div>
                <button type="button" disabled className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold text-white/30" title="Available when the local pipeline is implemented"><IconRefresh size={16}/> Pipeline not connected</button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
              <div className="flex items-center gap-2"><IconShieldLock size={18} className="text-emerald-200"/><h2 className="text-sm font-semibold">Capability preflight</h2></div>
              <p className="mt-2 text-xs leading-5 text-white/45">Current UI draft status. A true preflight will check local binaries, OCR languages, GPU and configured model endpoints.</p>
              <div className="mt-4 space-y-3">
                {["Batch source selection","Browser image preview","Language and output settings"].map((x)=><div key={x} className="flex items-center gap-2 text-xs text-emerald-100/80"><IconCheck size={15}/>{x}</div>)}
                {["Panel detection + correction","Hindi/English OCR review","SRT/VTT timeline","Local FFmpeg MP4 export","Anime video generation + TTS"].map((x)=><div key={x} className="flex items-center gap-2 text-xs text-white/40"><span className="inline-block h-3.5 w-3.5 rounded-full border border-white/20"/>{x}<span className="ml-auto text-[9px] uppercase tracking-wider">planned</span></div>)}
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200/15 bg-violet-300/[.035] p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-violet-100/80">Selected configuration</div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-white/40">Language</dt><dd>{({hi:"Hindi",en:"English",both:"Hindi + English",hinglish:"Hinglish"} as Record<string,string>)[language]}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-white/40">Format</dt><dd>{format}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-white/40">Reading</dt><dd>{({ltr:"LTR",rtl:"RTL",vertical:"Vertical"} as Record<string,string>)[readingDirection]}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-white/40">Mode</dt><dd>{mode === "offline" ? "Strict offline" : "Hybrid"}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-white/10 p-4 text-xs leading-5 text-white/40">Tip: for your first test, use a few pages you own or have permission to adapt. Review every detected panel and dialogue line before generating scenes.</div>
          </aside>
        </div>
        <footer className="border-t border-white/10 pt-5 text-xs text-white/30">Indica Anime Us · Local-first comic adaptation studio</footer>
      </div>
    </main>
  )
}
