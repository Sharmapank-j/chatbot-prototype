export type ComicFileKind = "image" | "pdf"

export const MAX_COMIC_FILE_BYTES = 100 * 1024 * 1024
export const MAX_COMIC_FILES = 30
export const MAX_COMIC_BATCH_BYTES = 500 * 1024 * 1024

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"])
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"])

export function classifyComicFile(
  file: Pick<File, "name" | "type" | "size">
): { kind: ComicFileKind | null; error?: string } {
  if (file.size <= 0) return { kind: null, error: "file is empty" }
  if (file.size > MAX_COMIC_FILE_BYTES) {
    return { kind: null, error: "maximum file size is 100 MB" }
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  if (file.type === "application/pdf" || (!file.type && extension === "pdf")) {
    return { kind: "pdf" }
  }
  if (imageMimeTypes.has(file.type) || (!file.type && imageExtensions.has(extension))) {
    return { kind: "image" }
  }

  return { kind: null, error: "unsupported file type; choose JPG, PNG, WEBP or PDF" }
}
