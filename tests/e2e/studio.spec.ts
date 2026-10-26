import { expect, test } from "@playwright/test"

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7ioAAAAASUVORK5CYII=", "base64")

test("comic import -> dialogue edit -> reload -> project export and restore", async ({ page }) => {
  await page.goto("/en/indica")
  await expect(page.getByRole("heading", { name: "Start your first episode" })).toBeVisible()
  await page.getByRole("button", { name: "Create local project" }).click()
  await expect(page.getByRole("heading", { name: "Import comic pages" })).toBeVisible()

  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "synthetic-page.png",
    mimeType: "image/png",
    buffer: tinyPng
  })
  await expect(page.getByText("Shot 1", { exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: "dialogue", exact: true }).click()
  const dialogue = page.locator('textarea[placeholder="Enter dialogue manually or use Run OCR / AI vision."]')
  await dialogue.fill("Persistence smoke test")
  await expect(page.getByRole("status")).toContainText("Saved locally on this device.")
  await page.reload()
  await page.getByRole("button", { name: "dialogue", exact: true }).click()
  await expect(page.locator('textarea[placeholder="Enter dialogue manually or use Run OCR / AI vision."]')).toHaveValue("Persistence smoke test")

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Full project backup" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.indica\.json$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  await page.locator('input[accept=".indica.json,application/json"]').setInputFiles(path!)
  await expect(page.getByRole("status")).toContainText(/Restored .* with 1 source assets and 1 timeline shots\./)
  await expect(page.locator('textarea[placeholder="Enter dialogue manually or use Run OCR / AI vision."]')).toHaveValue("Persistence smoke test")
})
