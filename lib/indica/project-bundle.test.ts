import { parseProjectBundle, serializeProjectBundle } from "./project-bundle"

const sourceBlob = new Blob(["hello"], { type: "image/png" })
const source = {
  id: "project-1",
  name: "Episode",
  createdAt: 1,
  updatedAt: 2,
  language: "hi",
  aspect: "16:9",
  direction: "ltr",
  assets: [{ id: "asset-1", name: "page.png", type: "image/png", size: 5, blob: sourceBlob }],
  shots: [{ id: "shot-1", assetId: "asset-1", title: "Panel 1", dialogue: "नमस्ते", speaker: "A", start: 0, duration: 2, zoom: 1.04, crop: { x: 0, y: 0, w: 1, h: 1 } }]
}

describe("portable project persistence", () => {
  it("round-trips source blobs and editable timeline", async () => {
    const serialized = await serializeProjectBundle(source, async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ""
      bytes.forEach(byte => binary += String.fromCharCode(byte))
      return `data:${blob.type};base64,${btoa(binary)}`
    })
    const restored = parseProjectBundle(serialized, "backup.indica.json")
    expect(restored.name).toBe("Episode")
    expect(restored.assets[0].blob.size).toBe(5)
    expect(restored.assets[0].blob.type).toBe("image/png")
    expect(restored.shots[0].dialogue).toBe("नमस्ते")
    expect(restored.shots[0].crop).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it("rejects invalid JSON and unsupported versions", () => {
    expect(() => parseProjectBundle("{broken")).toThrow("not valid JSON")
    expect(() => parseProjectBundle(JSON.stringify({ formatVersion: 1 }))).toThrow("Unsupported project bundle")
  })

  it("rejects broken asset references and unsafe crop bounds", async () => {
    const bundle = JSON.parse(await serializeProjectBundle(source, async () => "data:image/png;base64,aGVsbG8="))
    bundle.shots[0].assetId = "missing"
    expect(() => parseProjectBundle(JSON.stringify(bundle))).toThrow("invalid asset references")
    bundle.shots[0].assetId = "asset-1"
    bundle.shots[0].crop = { x: 0.9, y: 0, w: 0.5, h: 1 }
    expect(() => parseProjectBundle(JSON.stringify(bundle))).toThrow("invalid crop box")
  })

  it("rejects asset size mismatches and duplicate asset ids", async () => {
    const bundle = JSON.parse(await serializeProjectBundle(source, async () => "data:image/png;base64,aGVsbG8="))
    bundle.assets[0].size = 6
    expect(() => parseProjectBundle(JSON.stringify(bundle))).toThrow("size mismatch")
    bundle.assets[0].size = 5
    bundle.assets.push({ ...bundle.assets[0], name: "duplicate.png" })
    expect(() => parseProjectBundle(JSON.stringify(bundle))).toThrow("duplicate asset")
  })
})
