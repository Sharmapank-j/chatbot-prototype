"use client"

import { IconArrowRight, IconBook2, IconMovie, IconMicrophone2 } from "@tabler/icons-react"
import Link from "next/link"

const steps = [
  { icon: IconBook2, number: "01", title: "Import a comic batch", detail: "Bring in page images or a PDF. Keep originals, page order and reading direction under your control." },
  { icon: IconMovie, number: "02", title: "Build the storyboard", detail: "Detect panels, correct OCR, assign speakers and shape the scene timeline before rendering." },
  { icon: IconMicrophone2, number: "03", title: "Dub & export", detail: "Plan Hindi or English voices, review subtitles, then assemble shots into an MP4." },
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#08090d] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 70% 5%, rgba(100,70,220,.28), transparent 35%), radial-gradient(circle at 10% 45%, rgba(25,180,170,.12), transparent 30%)" }} />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-7 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Indica Anime Us home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-400/10 text-violet-200">
              <IconMovie size={22} stroke={1.7} />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[.16em]">INDICA</span>
              <span className="block text-[10px] tracking-[.22em] text-white/45">ANIME US · STUDIO</span>
            </span>
          </Link>
          <div className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs text-emerald-200 sm:block">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" /> Local-first workflow
          </div>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-200/[.06] px-3 py-1.5 text-xs text-violet-100/80">
              <IconBook2 size={15} /> Offline base · Optional AI providers
            </div>
            <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-.045em] sm:text-6xl lg:text-7xl">
              Comics in.
              <span className="block bg-gradient-to-r from-violet-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">Anime stories out.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/60 sm:text-lg">
              Turn a batch of comic pages into an editable storyboard, moving scenes, Hindi or English dialogue, subtitles and a finished video — without forcing your source pages into a cloud upload.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/indica" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-violet-100">
                Open workspace <IconArrowRight size={18} />
              </Link>
              <Link href="https://github.com/geeklee/srt-whiteboard-animation" target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white/75 transition hover:border-white/30 hover:text-white">
                Timeline inspiration
              </Link>
            </div>
            <p className="mt-4 max-w-lg text-xs leading-5 text-white/40">
              AI anime generation and neural voices are model-dependent. The starter must report unavailable engines honestly; local motion-comic export is the first offline target.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-violet-500/15 via-transparent to-cyan-500/10 blur-2xl" />
            <div className="relative rounded-[1.6rem] border border-white/10 bg-[#11131b]/90 p-4 shadow-2xl shadow-black/50 sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div><div className="text-sm font-semibold">Episode workspace</div><div className="mt-1 text-xs text-white/40">Project preview · Example workflow</div></div>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/45">Draft</span>
              </div>
              <div className="mt-5 grid grid-cols-[.9fr_1.1fr] gap-3">
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/10 bg-white/[.035] p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Source pages</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1,2,3,4,5,6].map(n => <div key={n} className="aspect-[3/4] rounded-md border border-white/10 bg-gradient-to-br from-[#282b44] via-[#161925] to-[#65375e] p-1"><div className="h-full rounded border border-white/10 bg-[linear-gradient(155deg,transparent_50%,rgba(255,255,255,.08)_50%)]" /></div>)}
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-200/75">6 pages · ready for review</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.035] p-3">
                    <div className="text-[10px] uppercase tracking-widest text-white/35">Dialogue</div>
                    <div className="mt-2 rounded-lg bg-black/20 p-2 text-xs text-white/70">“अब समय आ गया है।”</div>
                    <div className="mt-1 rounded-lg bg-black/20 p-2 text-xs text-white/70">“It's time to move.”</div>
                  </div>
                </div>
                <div className="flex min-h-[310px] flex-col rounded-xl border border-violet-200/15 bg-gradient-to-br from-[#2b1b45] via-[#151928] to-[#0e353c] p-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45"><span>Shot 03</span><span>2.8 sec</span></div>
                  <div className="my-auto px-3 text-center">
                    <div className="mx-auto flex h-36 w-28 items-center justify-center rounded-[45%] border border-white/15 bg-gradient-to-b from-[#c6a8ec]/25 to-[#1d273e] shadow-[0_0_60px_rgba(167,139,250,.16)]">
                      <div className="relative h-28 w-20 rounded-[45%] bg-gradient-to-b from-[#252336] via-[#393047] to-[#10151e]">
                        <div className="absolute left-3 top-9 h-2 w-3 rounded-full bg-cyan-200 shadow-[0_0_10px_2px_rgba(103,232,249,.4)]" />
                        <div className="absolute right-3 top-9 h-2 w-3 rounded-full bg-cyan-200 shadow-[0_0_10px_2px_rgba(103,232,249,.4)]" />
                      </div>
                    </div>
                    <div className="mt-4 text-xs font-medium text-white/85">Keyframe → camera motion → scene</div>
                    <div className="mt-1 text-[10px] text-white/40">Illustrative interface preview, not a generated result</div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                    <div className="h-1.5 flex-1 rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-violet-300" /></div>
                    <span className="text-[10px] text-white/50">03 / 08</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {["Panel review","Voice tracks","MP4 render"].map((x, i) => <div key={x} className="rounded-lg border border-white/10 bg-white/[.025] px-2 py-3 text-center"><div className="text-[10px] text-white/35">0{i+1}</div><div className="mt-1 text-xs text-white/75">{x}</div></div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-white/10 py-10 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon
            return <article key={step.number} className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center justify-between"><span className="text-xs tracking-widest text-violet-200/70">{step.number}</span><Icon size={19} className="text-white/45" /></div><h2 className="mt-5 text-lg font-semibold">{step.title}</h2><p className="mt-2 text-sm leading-6 text-white/50">{step.detail}</p></article>
          })}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-white/35">
          <span>Indica Anime Us · Local-first comic adaptation workspace</span>
          <span>Adapt only content you are authorized to use.</span>
        </footer>
      </div>
    </main>
  )
}
