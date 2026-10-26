import { NextRequest, NextResponse } from "next/server"\nimport { isIP } from "node:net"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProviderInput = {
  action?: "analyze" | "generate" | "generate-image"
  baseUrl?: string
  apiKey?: string
  model?: string
  prompt?: string
  imageDataUrl?: string
}

const MAX_IMAGE_BYTES = 7 * 1024 * 1024
const MAX_PROMPT_CHARS = 12000
const MAX_KEY_CHARS = 4096

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function validateProviderUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    if (url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1" || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.16.") || host.endsWith(".internal")) return null
    return url
  } catch {
    return null
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "")
}

function parseImageDataUrl(value: string): { mime: string; base64: string; size: number } | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value)
  if (!match) return null
  const base64 = match[2].replace(/\s/g, "")
  const size = Math.floor(base64.length * 3 / 4)
  if (size <= 0 || size > MAX_IMAGE_BYTES) return null
  return { mime: match[1], base64, size }
}

async function readProviderError(response: Response) {
  const raw = await response.text()
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string }
    const detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message
    return detail?.slice(0, 500) || `Provider returned HTTP ${response.status}`
  } catch {
    return `Provider returned HTTP ${response.status}: ${raw.slice(0, 250)}`
  }
}

export async function POST(request: NextRequest) {
  let input: ProviderInput
  try {
    input = await request.json() as ProviderInput
  } catch {
    return jsonError("Request body must be valid JSON.", 400)
  }

  const action = input.action
  if (!action || !["analyze", "generate", "generate-image"].includes(action)) return jsonError("Unsupported provider action.", 400)
  const baseUrl = typeof input.baseUrl === "string" ? normalizeBaseUrl(input.baseUrl) : ""
  const model = typeof input.model === "string" ? input.model.trim() : ""
  const apiKey = typeof input.apiKey === "string" ? input.apiKey : ""
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""

  if (!baseUrl || !model || !apiKey || apiKey.length > MAX_KEY_CHARS) return jsonError("Provider URL, model, and API key are required.", 400)
  const providerUrl = validateProviderUrl(baseUrl)
  if (!providerUrl) return jsonError("Provider URL must be HTTPS on a public host. Local/private network endpoints are not accepted by this hosted API.", 400)
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return jsonError(`Prompt is required and must be under ${MAX_PROMPT_CHARS} characters.`, 400)

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }

  try {
    if (action === "generate-image") {
      const endpoint = `${baseUrl}/images/generations`
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
        signal: AbortSignal.timeout(90000),
        cache: "no-store"
      })
      if (!response.ok) return jsonError(await readProviderError(response), 502)
      const result = await response.json() as { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> }
      const image = result.data?.[0]
      if (image?.b64_json) {
        const size = Math.floor(image.b64_json.length * 3 / 4)
        if (size > 12 * 1024 * 1024) return jsonError("Generated image exceeded the response size limit.", 502)
        return NextResponse.json({ imageDataUrl: `data:image/png;base64,${image.b64_json}`, revisedPrompt: image.revised_prompt ?? prompt })
      }
      if (image?.url && /^https:\/\//.test(image.url)) return NextResponse.json({ imageUrl: image.url, revisedPrompt: image.revised_prompt ?? prompt })
      return jsonError("Provider returned no usable image. Check that its endpoint supports the OpenAI Images API.", 502)
    }

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }]
    if (action === "analyze") {
      const image = typeof input.imageDataUrl === "string" ? parseImageDataUrl(input.imageDataUrl) : null
      if (!image) return jsonError("Analysis requires a PNG, JPEG, WEBP or GIF image under 7 MB.", 400)
      content.push({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: "high" } })
    }
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: action === "analyze" ? content : prompt }],
        temperature: action === "analyze" ? 0.1 : 0.7,
        max_tokens: action === "analyze" ? 3500 : 5000
      }),
      signal: AbortSignal.timeout(90000),
      cache: "no-store"
    })
    if (!response.ok) return jsonError(await readProviderError(response), 502)
    const result = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> }
    const rawContent = result.choices?.[0]?.message?.content
    const text = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? rawContent.map(part => part.text ?? "").join("\n") : ""
    if (!text.trim()) return jsonError("Provider returned an empty response.", 502)
    return NextResponse.json({ text: text.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed."
    return jsonError(message.includes("timeout") ? "Provider timed out. Try again or use a smaller image." : "Could not reach the provider. Check the endpoint, model, API key, and provider compatibility.", 502)
  }
}
