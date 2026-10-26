import {
  classifyComicFile,
  MAX_COMIC_FILE_BYTES
} from "./file-validation"

describe("classifyComicFile", () => {
  it.each([
    ["page.jpg", "image/jpeg", "image"],
    ["page.png", "image/png", "image"],
    ["page.webp", "image/webp", "image"],
    ["chapter.pdf", "application/pdf", "pdf"]
  ])("accepts %s", (name, type, kind) => {
    expect(classifyComicFile({ name, type, size: 1024 })).toEqual({ kind })
  })

  it("uses a supported extension when the browser omits MIME type", () => {
    expect(classifyComicFile({ name: "chapter.PDF", type: "", size: 10 })).toEqual({ kind: "pdf" })
    expect(classifyComicFile({ name: "page.jpeg", type: "", size: 10 })).toEqual({ kind: "image" })
  })

  it("rejects unsupported formats, including SVG", () => {
    expect(classifyComicFile({ name: "art.svg", type: "image/svg+xml", size: 10 }).kind).toBeNull()
    expect(classifyComicFile({ name: "notes.txt", type: "text/plain", size: 10 }).kind).toBeNull()
  })

  it("rejects empty files", () => {
    expect(classifyComicFile({ name: "page.png", type: "image/png", size: 0 })).toEqual({
      kind: null,
      error: "file is empty"
    })
  })

  it("rejects files over the per-file limit", () => {
    expect(classifyComicFile({ name: "page.png", type: "image/png", size: MAX_COMIC_FILE_BYTES + 1 })).toEqual({
      kind: null,
      error: "maximum file size is 100 MB"
    })
  })
})
