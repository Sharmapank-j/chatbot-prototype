import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export const MAX_PROVIDER_IMAGE_BYTES = 3 * 1024 * 1024

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().split("%")[0]
  const family = isIP(value)
  if (family === 4) {
    const parts = value.split(".").map(Number)
    const [a,b] = parts
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
  }
  if (family === 6) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
        value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
        value.startsWith("ff")) return true
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  return true
}

export function validateProviderUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null
    const host = url.hostname.toLowerCase()
    if (isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost") ||
        host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") ||
        host.endsWith(".invalid") || !host.includes(".")) return null
    return url
  } catch {
    return null
  }
}

export async function assertPublicProviderHost(url: URL): Promise<void> {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error("Provider host resolves to a private or reserved network address.")
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
