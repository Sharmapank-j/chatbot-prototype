import { parseImageDataUrl, validateProviderUrl } from "./provider-validation"

describe("validateProviderUrl", () => {
  it("accepts a public HTTPS provider endpoint", () => {
    expect(validateProviderUrl("https://api.openai.com/v1")?.hostname).toBe("api.openai.com")
  })

  it.each([
    "http://api.example.com/v1",
    "https://localhost:11434/v1",
    "https://127.0.0.1:11434/v1",
    "https://192.168.1.12/v1",
    "https://user:password@example.com/v1",
    "not a URL"
  ])("rejects unsafe or malformed endpoint %s", value => {
    expect(validateProviderUrl(value)).toBeNull()
  })
})

describe("parseImageDataUrl", () => {
  it("parses an allowed base64 image", () => {
    expect(parseImageDataUrl("data:image/png;base64,aGVsbG8=")).toEqual({
      mime: "image/png",
      base64: "aGVsbG8=",
      size: 5
    })
  })

  it("rejects unsupported formats and malformed payloads", () => {
    expect(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull()
    expect(parseImageDataUrl("not-an-image")).toBeNull()
  })
})
