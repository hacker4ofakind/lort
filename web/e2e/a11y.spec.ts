import { expect, test } from "@playwright/test"
import { expectAccessible, seedPost, seedRequest, seedRoadmapRequest, setRoadmapPublic, signInAdmin, unique } from "./helpers"

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

test("the public roadmap and the shipped list", async ({ page, request }) => {
  const u = unique()
  await seedRoadmapRequest(request, `Planned accessible ${u}`, "planned")
  await seedRoadmapRequest(request, `Building accessible ${u}`, "progress")
  await seedRoadmapRequest(request, `Shipped accessible ${u}`, "completed")
  await page.goto("/roadmap")
  await expect(page.getByRole("link", { name: `Planned accessible ${u}` })).toBeVisible()
  await expectAccessible(page)
  await page.goto("/roadmap/shipped")
  await expect(page.getByRole("link", { name: `Shipped accessible ${u}` })).toBeVisible()
  await expectAccessible(page)
})

test("the roadmap's off message", async ({ page, request }) => {
  await setRoadmapPublic(request, false)
  try {
    await page.goto("/roadmap")
    await expect(page.getByText("No public roadmap yet")).toBeVisible()
    await expectAccessible(page)
  } finally {
    await setRoadmapPublic(request, true)
  }
})

test("the dashboard roadmap, and its card being lifted", async ({ page, request }) => {
  const title = `Dashboard accessible ${unique()}`
  await seedRoadmapRequest(request, title, "planned")
  await signInAdmin(page)
  await page.goto("/dashboard/roadmap")
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible()
  await expectAccessible(page)

  // Mid-drag: the lifted card, the dashed slot and the lit-up column.
  await page.getByRole("button", { name: title, exact: true }).focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("[id^=DndLiveRegion]")).toContainText("is over In progress.")
  await expectAccessible(page)
  await page.keyboard.press("Escape")
})

test("the changelog pages, public and dashboard", async ({ page, request }) => {
  const u = unique()
  const { slug } = await seedPost(request, { title: `Accessible post ${u}`, body: "## What changed\n\nIt is **better**.", labels: ["new"] }, true)
  const draft = await seedPost(request, { title: `Accessible draft ${u}`, body: "Hello." })
  await page.goto("/changelog")
  await expect(page.getByRole("link", { name: `Accessible post ${u}` })).toBeVisible()
  await expectAccessible(page)
  await page.goto(`/changelog/${slug}`)
  await expect(page.getByRole("heading", { level: 1, name: `Accessible post ${u}` })).toBeVisible()
  await expectAccessible(page)
  await page.goto("/changelog/not-a-post")
  await expect(page.getByText("This post isn't here")).toBeVisible()
  await expectAccessible(page)

  await signInAdmin(page)
  await page.goto("/dashboard/changelog")
  await expect(page.getByRole("link", { name: `Accessible draft ${u}` })).toBeVisible()
  await expectAccessible(page)
  await page.goto(`/dashboard/changelog/${draft.id}`)
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`Accessible draft ${u}`)
  await expectAccessible(page)
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  await page.getByRole("button", { name: /Schedule…/ }).click()
  await expect(page.getByLabel("At", { exact: true })).toBeVisible()
  await expectAccessible(page)
})
