import { isPrivateAddress, parseImageDataUrl, validateProviderUrl } from "./provider-validation"

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

describe("private address rejection", () => {
  it.each(["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.2", "169.254.1.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])("rejects private or reserved address %s", address => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", address => {
    expect(isPrivateAddress(address)).toBe(false)
  })
})
