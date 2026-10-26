import { isIP } from "node:net"

export const MAX_PROVIDER_IMAGE_BYTES = 3 * 1024 * 1024

export function validateProviderUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    if (url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid")) return null
    return url
  } catch {
    return null
  }
}

export function parseImageDataUrl(value: string): { mime: string; base64: string; size: number } | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value)
  if (!match) return null
  const base64 = match[2].replace(/\s/g, "")
  const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
  if (size <= 0 || size > MAX_PROVIDER_IMAGE_BYTES) return null
  return { mime: match[1], base64, size }
}
