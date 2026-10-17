import { expect, test } from "@playwright/test"
import { expectAccessible, seedRequest, signInAdmin, unique } from "./helpers"

// axe on every 1B page, in both themes (the projects in playwright.config.ts).

test("public pages", async ({ page, request }) => {
  const { id } = await seedRequest(request, `Accessible idea ${unique()}`)
  await page.goto("/feedback")
  await expect(page.getByRole("article").first()).toBeVisible()
  await expectAccessible(page)
  await page.goto(`/feedback/${id}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expectAccessible(page)
  await page.goto("/feedback")
  await page.getByRole("button", { name: "Suggest something" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expectAccessible(page)
})

test("dashboard pages", async ({ page, request }) => {
  const title = `Accessible request ${unique()}`
  await seedRequest(request, title)
  await page.goto("/dashboard/login")
  await expectAccessible(page)
  await signInAdmin(page)
  await expect(page.getByRole("link", { name: title })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole("link", { name: title }).click()
  await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
  await expect(page.getByRole("toolbar", { name: "Triage" })).toBeVisible()
  await expectAccessible(page)
  await page.goto("/dashboard/settings")
  await expect(page.getByLabel("App name")).toBeVisible()
  await expectAccessible(page)
})
