import { expect, test, type Page } from "@playwright/test"
import { seedRequest, signInAdmin, unique } from "./helpers"

async function openRequest(page: Page, title: string) {
  await page.goto("/dashboard/requests?status=all")
  await page.getByRole("link", { name: title }).click()
  await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
}

const triage = (page: Page) => page.getByRole("toolbar", { name: "Triage" })

test("the team moves a request through every status, with undo", async ({ page, request }) => {
  const title = `Calendar heatmap ${unique()}`
  await seedRequest(request, title)
  await signInAdmin(page)
  await expect(page.getByRole("link", { name: title })).toBeVisible()
  await openRequest(page, title)

  await triage(page).getByRole("button", { name: "Accept" }).click()
  await expect(page.getByRole("button", { name: "Status: Reviewing" })).toBeVisible()

  await triage(page).getByRole("button", { name: "Add to roadmap" }).click()
  await expect(page.getByText("Added to the roadmap")).toBeVisible()

  await triage(page).getByRole("button", { name: "Re-review" }).click()
  await expect(page.getByText("Taken off the roadmap")).toBeVisible()
  await triage(page).getByRole("button", { name: "Add to roadmap" }).click()
  await triage(page).getByRole("button", { name: "Start working" }).click()
  await expect(page.getByRole("button", { name: "Status: In progress" })).toBeVisible()

  await triage(page).getByRole("button", { name: "Complete" }).click()
  await expect(page.getByText("Marked as completed")).toBeVisible()
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByText("Moved back to In progress")).toBeVisible()
  await expect(page.getByRole("button", { name: "Status: In progress" })).toBeVisible()

  await triage(page).getByRole("button", { name: "Complete" }).click()
  await expect(page.getByRole("button", { name: "Status: Completed" })).toBeVisible()
  await triage(page).getByRole("button", { name: "Reopen" }).click()
  await expect(page.getByRole("button", { name: "Status: In progress" })).toBeVisible()
})

test("closing and reopening, and the status chip menu", async ({ page, request }) => {
  const title = `Share as image ${unique()}`
  await seedRequest(request, title)
  await signInAdmin(page)
  await openRequest(page, title)
  await triage(page).getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("button", { name: "Status: Closed" })).toBeVisible()
  await page.getByRole("button", { name: "Status: Closed" }).click()
  await page.getByRole("menuitem", { name: "Reopen" }).click()
  await expect(page.getByRole("button", { name: "Status: Pending" })).toBeVisible()
})

test("merging a duplicate moves it and leaves a pointer", async ({ page, request }) => {
  const id = unique()
  const target = `Dark theme ${id}`
  const source = `Night mode ${id}`
  await seedRequest(request, target)
  const src = await seedRequest(request, source)
  await signInAdmin(page)
  await openRequest(page, source)
  await triage(page).getByRole("button", { name: "Merge" }).click()
  await page.getByPlaceholder("Search by title").fill(`Dark theme ${id}`)
  await page.getByRole("option", { name: new RegExp(`Dark theme ${id}`) }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Merge", exact: true }).click()
  await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
  await expect(page.getByRole("heading", { level: 1, name: target })).toBeVisible()

  await page.goto(`/feedback/${src.id}`)
  await expect(page.getByText(`Merged into ${target}`)).toBeVisible()
})

test("internal notes stay inside the team, and Skip opens the next request", async ({ page, request }) => {
  const id = unique()
  const first = await seedRequest(request, `Widget ${id} one`)
  await seedRequest(request, `Widget ${id} two`)
  await signInAdmin(page)
  await page.goto(`/dashboard/requests?q=${encodeURIComponent(`Widget ${id}`)}&sort=oldest`)
  await page.getByRole("link", { name: `Widget ${id} one` }).click()
  await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
  await expect(page.getByText("1 of 2 open")).toBeVisible()

  await page.getByRole("button", { name: /Visibility: Public/ }).click()
  await page.getByRole("textbox", { name: "Internal note" }).fill(`Reproduced ${id}`)
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Only the team sees this")).toBeVisible()

  await triage(page).getByRole("button", { name: "Skip" }).click()
  await expect(page.getByRole("heading", { level: 1, name: `Widget ${id} two` })).toBeVisible()

  await page.goto(`/feedback/${first.id}`)
  await expect(page.getByRole("heading", { level: 1, name: `Widget ${id} one` })).toBeVisible()
  await expect(page.getByText(`Reproduced ${id}`)).toHaveCount(0)
})

test("a request posted for someone else carries their name", async ({ page }) => {
  const id = unique()
  await signInAdmin(page)
  await page.getByRole("button", { name: "New request" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title").fill(`Offline mode ${id}`)
  await dialog.getByLabel("On behalf of (optional)").fill(`priya-${id}@example.com`)
  await dialog.getByRole("textbox", { name: "Details" }).fill("Asked for this on a call.")
  await dialog.getByRole("button", { name: "Send" }).click()
  await page.waitForURL(/\/dashboard\/requests\/[a-z0-9]+/)
  await expect(page.getByText(`priya-${id} posted this in Features`)).toBeVisible()
})
