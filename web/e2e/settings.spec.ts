import { expect, test } from "@playwright/test"
import { signInAdmin, unique } from "./helpers"

test.beforeEach(async ({ page }) => {
  await signInAdmin(page)
  await page.goto("/dashboard/settings")
})

test("renaming the app changes the board", async ({ page }) => {
  const name = `Driftnote ${unique()}`
  const field = page.getByLabel("App name")
  await field.fill(name)
  await field.press("Enter")
  await expect(page.getByText("Saved the app name.")).toBeVisible()
  await page.goto("/feedback")
  await expect(page.getByRole("heading", { level: 1, name: `Got an idea for ${name}?` })).toBeVisible()

  await page.goto("/dashboard/settings")
  await page.getByLabel("App name").fill("Driftnote")
  await page.getByLabel("App name").press("Enter")
  await expect(page.getByText("Saved the app name.")).toBeVisible()
})

test("boards can be added, renamed, reordered with the keyboard and deleted", async ({ page }) => {
  const name = `Ideas ${unique()}`
  await page.getByRole("button", { name: "Add board" }).click()
  const field = page.getByLabel("Name of New board")
  await field.fill(name)
  await field.press("Enter")
  await expect(page.getByText("Renamed the board.")).toBeVisible()

  // Space lifts, arrows move, Space drops (dnd-kit's keyboard sensor). Like a person, wait for
  // each move to be announced before the next key: a move can scroll the page first, and the
  // row only lands once the scroll is measured.
  const rows = page.locator("#boards input[aria-label^='Name of']")
  const above = (await rows.count()) - 1
  const announced = page.locator("[id^=DndLiveRegion]").filter({ hasText: "Draggable item" })
  const grip = page.getByRole("button", { name: `Reorder ${name}` })
  await grip.focus()
  await page.keyboard.press("Space")
  // Picking up announces the row over itself; moves are counted from there.
  await expect(announced).toContainText("over droppable area")
  for (let i = 0; i < above; i++) {
    const before = await announced.textContent()
    await page.keyboard.press("ArrowUp")
    await expect(announced).not.toHaveText(before ?? "")
  }
  await page.keyboard.press("Space")
  await expect(page.locator("#boards").getByText("Default", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Name of Features")).toBeVisible()
  await expect(rows.first()).toHaveValue(name)

  await page.getByRole("button", { name: `Delete ${name}` }).click()
  await page.getByRole("button", { name: "Delete board" }).click()
  await expect(page.getByText(`Deleted ${name}.`)).toBeVisible()
  await expect(rows.first()).toHaveValue("Features")
})

test("tags can be added and deleted", async ({ page }) => {
  const tag = `android${unique()}`
  await page.getByRole("button", { name: "Add a tag" }).click()
  await page.getByLabel("New tag").fill(tag)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText("Added the tag.")).toBeVisible()
  await page.locator("#tags").getByRole("button", { name: tag, exact: true }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.locator("#tags").getByRole("button", { name: tag, exact: true })).toHaveCount(0)
})

test("the landing card can be switched off", async ({ page }) => {
  const toggle = page.getByRole("switch", { name: "Show “Get your own board” card" })
  await toggle.click()
  await expect(page.getByText("Hid the card.")).toBeVisible()
  await page.goto("/feedback")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByText("Get your own board like this")).toHaveCount(0)

  await page.goto("/dashboard/settings")
  await page.getByRole("switch", { name: "Show “Get your own board” card" }).click()
  await expect(page.getByText("The card is back.")).toBeVisible()
})

test("an invited admin sets a password and lands in the dashboard", async ({ page, browser }) => {
  const email = `sofia-${unique()}@example.com`
  await page.getByRole("button", { name: "Invite an admin" }).click()
  await page.getByLabel("Their email").fill(email)
  await page.getByRole("button", { name: "Create invite link" }).click()
  const link = await page.getByLabel("Invite link").inputValue()
  expect(link).toContain("/dashboard/invite?token=")

  const invitee = await browser.newPage()
  await invitee.goto(link.replace(/^https?:\/\/[^/]+/, ""))
  await expect(invitee.getByText(`You're joining as ${email}.`)).toBeVisible()
  await invitee.getByLabel("Choose a password").fill("correcthorse-sofia")
  await invitee.getByLabel("Type it again").fill("correcthorse-sofia")
  await invitee.getByRole("button", { name: "Join the team" }).click()
  await invitee.waitForURL(/\/dashboard\/requests/)
  await expect(invitee.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible()
  await invitee.close()
})
