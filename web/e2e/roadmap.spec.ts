import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  moveViaApi,
  seedHiddenRoadmapRequest,
  seedRequest,
  seedRoadmapRequest,
  signInAdmin,
  triage,
  unique,
} from "./helpers"

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("button", { name: title, exact: true })

/** A real mouse drag: a few pixels to pass dnd-kit's activation distance, then over the target and release. */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + 24, a.y + 20)
  await page.mouse.down()
  await page.mouse.move(a.x + 44, a.y + 30, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + 140, { steps: 16 })
  await page.mouse.up()
}

async function openRoadmap(page: Page) {
  await signInAdmin(page)
  await page.goto("/dashboard/roadmap")
  await expect(region(page, "Planned")).toBeVisible()
}

test.describe("public roadmap", () => {
  test("shows requests in their columns with when they got there, and keeps hidden ones off", async ({ page, request }) => {
    const u = unique()
    await seedRoadmapRequest(request, `Planned idea ${u}`, "planned")
    await seedRoadmapRequest(request, `Building idea ${u}`, "progress")
    await seedRoadmapRequest(request, `Shipped idea ${u}`, "completed")
    await seedHiddenRoadmapRequest(request, `Secret plan ${u}`, "planned")

    await page.goto("/roadmap")
    await expect(page.getByRole("heading", { level: 1, name: "What's coming to Driftnote?" })).toBeVisible()
    const row = (column: string, title: string) => region(page, column).getByRole("article").filter({ hasText: title })
    await expect(row("Planned", `Planned idea ${u}`)).toContainText(/Planned (just now|\d+ min ago)/)
    await expect(row("In progress", `Building idea ${u}`)).toContainText(/Started (just now|\d+ min ago)/)
    await expect(row("Completed", `Shipped idea ${u}`)).toContainText(/Shipped \d{2} [A-Z][a-z]{2}/)
    await expect(page.getByText(`Secret plan ${u}`)).toHaveCount(0)
    await expect(page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: "Roadmap" })).toHaveAttribute("aria-current", "page")
  })

  test("a visitor's vote shows, read-only, and the title opens the request", async ({ page, request }) => {
    const u = unique()
    const { id, token } = await seedRoadmapRequest(request, `Voted idea ${u}`, "planned")
    await page.goto("/roadmap")
    const item = region(page, "Planned").getByRole("article").filter({ hasText: `Voted idea ${u}` })
    // The author's own vote is in the count; the sticker is not a button.
    await expect(item.getByLabel("1 vote")).toBeVisible()
    await expect(item.getByRole("button")).toHaveCount(0)
    expect(token).toBeTruthy()
    await item.getByRole("link", { name: `Voted idea ${u}` }).click()
    await page.waitForURL(new RegExp(`/feedback/${id}`))
  })

  test("Planned is ordered by votes", async ({ page, request }) => {
    const u = unique()
    const first = await seedRoadmapRequest(request, `Fewer votes ${u}`, "planned")
    const second = await seedRoadmapRequest(request, `More votes ${u}`, "planned")
    const voter = await seedRequest(request, `Voter ${u}`)
    for (const id of [second.id]) {
      const res = await request.post(`http://127.0.0.1:4052/api/lort/requests/${id}/vote`, { headers: { Authorization: voter.token } })
      expect(res.ok()).toBeTruthy()
    }
    expect(first.id).not.toBe(second.id)

    await page.goto("/roadmap")
    await expect(region(page, "Planned").getByRole("link", { name: `Fewer votes ${u}` })).toBeVisible()
    const titles = await region(page, "Planned").getByRole("article").getByRole("heading").allTextContents()
    expect(titles.indexOf(`More votes ${u}`)).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf(`More votes ${u}`)).toBeLessThan(titles.indexOf(`Fewer votes ${u}`))
  })

  test("shows the page and its headings while the roadmap loads", async ({ page }) => {
    await page.route("**/api/lort/roadmap", async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.goto("/roadmap")
    await expect(page.getByRole("heading", { level: 1, name: "What's coming to Driftnote?" })).toBeVisible()
    await expect(page.locator("[aria-busy=true]")).toBeVisible()
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0)
  })

  test("the shipped list shows the newest first", async ({ page, request }) => {
    const u = unique()
    await seedRoadmapRequest(request, `Shipped first ${u}`, "completed")
    await page.waitForTimeout(1100) // the server stamps whole milliseconds, but be kind to slow clocks
    await seedRoadmapRequest(request, `Shipped second ${u}`, "completed")

    await page.goto("/roadmap/shipped")
    await expect(page.getByRole("heading", { level: 1, name: "Everything Driftnote has shipped" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Roadmap", exact: true }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: `Shipped first ${u}` })).toBeVisible()
    const titles = await page.getByRole("article").getByRole("heading").allTextContents()
    expect(titles.indexOf(`Shipped second ${u}`)).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf(`Shipped second ${u}`)).toBeLessThan(titles.indexOf(`Shipped first ${u}`))
  })
})

test.describe("dashboard roadmap", () => {
  test("opens with the sidebar as a rail and shows hidden requests too", async ({ page, request }) => {
    const u = unique()
    await seedHiddenRoadmapRequest(request, `Hidden plan ${u}`, "planned")
    await openRoadmap(page)
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible()
    const hidden = card(page, `Hidden plan ${u}`)
    await expect(hidden).toBeVisible()
    await expect(hidden).toContainText("Hidden")
  })

  test("a card dragged to another column moves, and stays there", async ({ page, request }) => {
    const title = `Drag me ${unique()}`
    const { id } = await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)

    await drag(page, card(page, title), region(page, "In progress"))
    await expect(page.getByText("Moved to In progress")).toBeVisible()
    await expect(region(page, "In progress").getByRole("button", { name: title, exact: true })).toBeVisible()

    await page.reload()
    await expect(region(page, "In progress").getByRole("button", { name: title, exact: true })).toBeVisible()
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toHaveCount(0)

    // The timeline tells the story: planned, then started.
    await page.goto(`/dashboard/requests/${id}`)
    const activity = page.getByRole("region", { name: "Activity" })
    await expect(activity.getByText(/moved this to In progress/)).toBeVisible()
    await expect(activity.getByText(/moved this to Planned/)).toBeVisible()
  })

  test("any column to any column: Planned straight to Completed, and Completed back to Planned", async ({ page, request }) => {
    const title = `Anywhere ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)

    await drag(page, card(page, title), region(page, "Completed"))
    await expect(page.getByText(`Marked “${title}” as completed`)).toBeVisible()
    await expect(region(page, "Completed").getByRole("button", { name: title, exact: true })).toBeVisible()

    await drag(page, card(page, title), region(page, "Planned"))
    await expect(page.getByText("Moved to Planned")).toBeVisible()
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toBeVisible()

    await page.goto("/roadmap")
    const item = region(page, "Planned").getByRole("article").filter({ hasText: title })
    await expect(item).toContainText(/Planned (just now|\d+ min ago)/)
  })

  test("a card moves with the keyboard, announced as it goes", async ({ page, request }) => {
    const title = `Keys ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)
    const announced = page.locator("[id^=DndLiveRegion]")

    await card(page, title).focus()
    await page.keyboard.press("Space")
    await expect(announced).toContainText(`Picked up ${title}. It's in Planned.`)
    await page.keyboard.press("ArrowRight")
    await expect(announced).toContainText(`${title} is over In progress.`)
    await page.keyboard.press("Space")
    await expect(announced).toContainText(`Moved ${title} to In progress.`)
    await expect(region(page, "In progress").getByRole("button", { name: title, exact: true })).toBeFocused()
  })

  test("Escape cancels a keyboard move, and Enter opens the request", async ({ page, request }) => {
    const title = `Cancel ${unique()}`
    const { id } = await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)
    const announced = page.locator("[id^=DndLiveRegion]")

    await card(page, title).focus()
    await page.keyboard.press("Space")
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Escape")
    await expect(announced).toContainText(`Cancelled. ${title} stays in Planned.`)
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toBeVisible()

    await card(page, title).focus()
    await page.keyboard.press("Enter")
    await page.waitForURL(new RegExp(`/dashboard/requests/${id}`))
  })

  test("dropping into Completed offers Undo, which puts the card back", async ({ page, request }) => {
    const title = `Ship me ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)

    await drag(page, card(page, title), region(page, "Completed"))
    await expect(page.getByText(`Marked “${title}” as completed`)).toBeVisible()
    await expect(region(page, "Completed").getByRole("button", { name: title, exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Undo" }).click()
    await expect(page.getByText("Moved back to Planned")).toBeVisible()
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toBeVisible()
  })

  test("a stale board can't undo a teammate's move", async ({ page, request }) => {
    const title = `Stale ${unique()}`
    const { id } = await seedRoadmapRequest(request, title, "progress")
    await page.route("**/api/realtime**", (route) => route.abort()) // this board hears nothing
    await openRoadmap(page)
    await expect(region(page, "In progress").getByRole("button", { name: title, exact: true })).toBeVisible()

    // A teammate completes it; this board still shows In progress.
    await moveViaApi(request, id, "progress", "completed")
    await drag(page, card(page, title), region(page, "Planned"))
    await expect(page.getByText(`Couldn't move “${title}”. Someone moved that card meanwhile.`)).toBeVisible()
    await expect(region(page, "Completed").getByRole("button", { name: title, exact: true })).toBeVisible()
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toHaveCount(0)
  })

  test("two cards moved at once both stay where they were dropped", async ({ page, request }) => {
    const u = unique()
    await seedRoadmapRequest(request, `Quick A ${u}`, "planned")
    await seedRoadmapRequest(request, `Quick B ${u}`, "planned")
    await page.route("**/api/lort/requests/*/roadmap", async (route) => {
      await new Promise((r) => setTimeout(r, 2000))
      await route.continue()
    })
    await openRoadmap(page)

    await drag(page, card(page, `Quick A ${u}`), region(page, "In progress"))
    await drag(page, card(page, `Quick B ${u}`), region(page, "Completed"))
    await expect(region(page, "In progress").getByRole("button", { name: `Quick A ${u}`, exact: true })).toBeVisible()
    await expect(region(page, "Completed").getByRole("button", { name: `Quick B ${u}`, exact: true })).toBeVisible()
    await expect(card(page, `Quick A ${u}`)).toHaveAttribute("aria-busy", "true")
    await expect(page.getByText("Moved to In progress")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(`Marked “Quick B ${u}” as completed`)).toBeVisible()
    await expect(region(page, "In progress").getByRole("button", { name: `Quick A ${u}`, exact: true })).toBeVisible()
    await expect(region(page, "Completed").getByRole("button", { name: `Quick B ${u}`, exact: true })).toBeVisible()
  })

  test("a roadmap that fails to load says so, and loads on Try again", async ({ page }) => {
    await signInAdmin(page)
    await page.route("**/api/lort/roadmap", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }))
    await page.goto("/dashboard/roadmap")
    await expect(page.getByText("The roadmap didn't load.")).toBeVisible({ timeout: 10_000 })
    await page.unroute("**/api/lort/roadmap")
    await page.getByRole("button", { name: "Try again" }).click()
    await expect(region(page, "Planned")).toBeVisible()
  })

  test("shows the page and its headings while the roadmap loads", async ({ page }) => {
    await signInAdmin(page)
    await page.route("**/api/lort/roadmap", async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.goto("/dashboard/roadmap")
    await expect(page.getByRole("heading", { level: 1, name: "Roadmap" })).toBeVisible()
    await expect(page.locator("[aria-busy=true]")).toBeVisible()
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0)
  })

  test("a card the team triaged off the roadmap meanwhile is refused and disappears", async ({ page, request }) => {
    const title = `Gone ${unique()}`
    const { id } = await seedRoadmapRequest(request, title, "planned")
    await page.route("**/api/realtime**", (route) => route.abort())
    await openRoadmap(page)
    await expect(card(page, title)).toBeVisible()

    await triage(request, id, "rereview") // Planned → Reviewing, behind this board's back
    await drag(page, card(page, title), region(page, "In progress"))
    await expect(page.getByText("That request isn't on the roadmap any more.")).toBeVisible()
    await expect(card(page, title)).toHaveCount(0)
  })

  test("+ on Planned puts a new request straight into the column", async ({ page }) => {
    const title = `Widgets ${unique()}`
    await openRoadmap(page)
    await page.getByRole("button", { name: "Add a planned request" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("It goes straight into Planned.")).toBeVisible()
    await dialog.getByLabel("Title").fill(title)
    await dialog.getByRole("textbox", { name: "Details" }).fill("Added from the roadmap.")
    await dialog.getByRole("button", { name: "Send" }).click()
    await expect(page.getByText("Added to the roadmap")).toBeVisible()
    await expect(region(page, "Planned").getByRole("button", { name: title, exact: true })).toBeVisible()

    await card(page, title).focus()
    await page.keyboard.press("Enter")
    await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
    await expect(page.getByText("moved this to Planned")).toBeVisible()
    await expect(page.getByText(/posted this in/)).toBeVisible()
  })

  test("a collapsed column is a strip that remembers itself and still takes drops", async ({ page, request }) => {
    const title = `Strip ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)
    await page.getByRole("button", { name: "Collapse Completed" }).click()
    const strip = page.getByRole("button", { name: /^Completed, \d+ in the last 30 days\. Expand$/ })
    await expect(strip).toBeVisible()

    await page.reload()
    await expect(strip).toBeVisible()

    await drag(page, card(page, title), strip)
    await expect(page.getByText(`Marked “${title}” as completed`)).toBeVisible()
    await strip.click()
    await expect(region(page, "Completed").getByRole("button", { name: title, exact: true })).toBeVisible()
  })

  test("phones get a Move menu and a single column", async ({ page, request }) => {
    const title = `Phone ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await page.setViewportSize({ width: 375, height: 812 })
    await openRoadmap(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.getByRole("button", { name: `Move ${title}` }).click()
    await page.getByRole("menuitem", { name: "Move to In progress" }).click()
    await expect(page.getByText("Moved to In progress")).toBeVisible()
    await expect(region(page, "In progress").getByRole("button", { name: title, exact: true })).toBeVisible()
  })

  test("desktop cards have no Move menu", async ({ page, request }) => {
    const title = `Desktop ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    await openRoadmap(page)
    await expect(card(page, title)).toBeVisible()
    await expect(page.getByRole("button", { name: `Move ${title}` })).toBeHidden()
  })

  test("another visitor's page updates when the team moves a card", async ({ browser, page, request }) => {
    const title = `Live ${unique()}`
    await seedRoadmapRequest(request, title, "planned")
    const visitor = await (await browser.newContext()).newPage()
    await visitor.goto("http://localhost:4052/roadmap")
    await expect(region(visitor, "Planned").getByRole("article").filter({ hasText: title })).toBeVisible()

    await openRoadmap(page)
    await drag(page, card(page, title), region(page, "In progress"))
    await expect(region(visitor, "In progress").getByRole("article").filter({ hasText: title })).toBeVisible({ timeout: 10_000 })
    await visitor.context().close()
  })
})

test("a request nobody has accepted yet is not on the roadmap", async ({ page, request }) => {
  const title = `Not yet ${unique()}`
  await seedRequest(request, title)
  await page.goto("/roadmap")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByText(title)).toHaveCount(0)
})
