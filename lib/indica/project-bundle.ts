import { MAX_COMIC_BATCH_BYTES, MAX_COMIC_FILES } from "./file-validation"

export type PortableShot = {
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
export type PortableAsset = { id: string; name: string; type: string; size: number; blob: Blob }
export type PortableProject = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  language: string
  aspect: string
  direction: string
  shots: PortableShot[]
  assets: PortableAsset[]
}
type BundleAsset = { id: string; name: string; type: string; size: number; dataUrl: string }
type Bundle = Omit<PortableProject, "assets"> & { formatVersion: 2; exportedAt?: string; assets: BundleAsset[] }

export async function serializeProjectBundle(project: PortableProject, toDataUrl: (blob: Blob) => Promise<string>): Promise<string> {
  const assets = await Promise.all(project.assets.map(async asset => ({
    id: asset.id, name: asset.name, type: asset.type, size: asset.size, dataUrl: await toDataUrl(asset.blob)
  })))
  return JSON.stringify({ ...project, assets, formatVersion: 2, exportedAt: new Date().toISOString() })
}

function decodeDataUrl(value: string, name: string): Blob {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|pdf|octet-stream));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value)
  if (!match) throw new Error(`Invalid embedded source data for ${name}.`)
  const raw = atob(match[2].replace(/\s/g, ""))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new Blob([bytes], { type: match[1] })
}

export function parseProjectBundle(text: string, fileName = "project.indica.json"): PortableProject {
  if (text.length > 700 * 1024 * 1024) throw new Error("Project bundle exceeds the 700 MB decoded import limit.")
  let parsed: Partial<Bundle>
  try { parsed = JSON.parse(text) as Partial<Bundle> } catch { throw new Error("Project bundle is not valid JSON.") }
  if (parsed.formatVersion !== 2 || typeof parsed.id !== "string" || !parsed.id ||
      typeof parsed.name !== "string" || !Array.isArray(parsed.assets) || !Array.isArray(parsed.shots)) {
    throw new Error("Unsupported project bundle. Export a complete .indica.json backup from the current studio.")
  }
  if (parsed.assets.length > MAX_COMIC_FILES) throw new Error(`Project exceeds the ${MAX_COMIC_FILES}-asset limit.`)
  const seen = new Set<string>()
  let total = 0
  const assets: PortableAsset[] = parsed.assets.map(asset => {
    if (!asset || typeof asset.id !== "string" || !asset.id || seen.has(asset.id) ||
        typeof asset.name !== "string" || typeof asset.dataUrl !== "string") throw new Error("Project contains an invalid or duplicate asset entry.")
    seen.add(asset.id)
    const blob = decodeDataUrl(asset.dataUrl, asset.name)
    total += blob.size
    if (asset.size !== blob.size) throw new Error(`Source size mismatch for ${asset.name}.`)
    if (asset.type && blob.type !== asset.type) throw new Error(`Source MIME mismatch for ${asset.name}.`)
    return { id: asset.id, name: asset.name, type: asset.type || blob.type, size: blob.size, blob }
  })
  if (total > MAX_COMIC_BATCH_BYTES) throw new Error("Project exceeds the 500 MB source-asset limit.")
  const assetIds = new Set(assets.map(asset => asset.id))
  if (parsed.shots.length > 1000) throw new Error("Project contains too many timeline shots.")
  for (const shot of parsed.shots) {
    if (!shot || typeof shot.id !== "string" || !assetIds.has(shot.assetId) ||
        !Number.isFinite(shot.start) || shot.start < 0 ||
        !Number.isFinite(shot.duration) || shot.duration <= 0 || shot.duration > 3600 ||
        !Number.isFinite(shot.zoom) || shot.zoom < 1 || shot.zoom > 2) {
      throw new Error("Project timeline has invalid asset references, zoom, or timing values.")
    }
    const crop = shot.crop
    if (crop && (![crop.x,crop.y,crop.w,crop.h].every(Number.isFinite) ||
        crop.x < 0 || crop.y < 0 || crop.w <= 0 || crop.h <= 0 ||
        crop.x + crop.w > 1.001 || crop.y + crop.h > 1.001)) {
      throw new Error(`Project contains an invalid crop box for ${shot.title || shot.id}.`)
    }
  }
  return {
    id: crypto.randomUUID(),
    name: parsed.name || fileName.replace(/\.indica\.json$/i, ""),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    language: parsed.language === "en" ? "en" : "hi",
    aspect: ["16:9","9:16","1:1"].includes(parsed.aspect || "") ? parsed.aspect! : "16:9",
    direction: parsed.direction === "rtl" ? "rtl" : "ltr",
    assets,
    shots: parsed.shots.map(shot => ({ ...shot }))
  }
}
