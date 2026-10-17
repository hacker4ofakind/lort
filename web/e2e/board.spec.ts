import { expect, test } from "@playwright/test"
import { seedRequest, unique } from "./helpers"

test("a visitor signs up inside Suggest something, posts, votes and comments", async ({ page }) => {
  const id = unique()
  const title = `Dark mode ${id}`
  await page.goto("/feedback")
  await expect(page.getByRole("heading", { level: 1, name: "Got an idea for Driftnote?" })).toBeVisible()

  await page.getByRole("button", { name: "Suggest something" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email").fill(`visitor-${id}@example.com`)
  await dialog.getByLabel("Password").fill("correcthorse")
  await dialog.getByRole("button", { name: "Create account" }).click()

  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("button", { name: "ui" }).click()
  await dialog.getByRole("textbox", { name: "Details" }).fill("Writing at night is rough on the eyes.")
  await dialog.getByRole("button", { name: "Send" }).click()
  await page.waitForURL(/\/feedback\/[a-z0-9]+$/)
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()

  // The author's dot is already on it; peel it off and stick it back.
  const own = page.getByRole("button", { name: `Remove your upvote from ${title}, 1 vote` })
  await expect(own).toHaveAttribute("aria-pressed", "true")
  await own.click()
  await page.getByRole("button", { name: `Upvote ${title}, 0 votes` }).click()
  await expect(page.getByRole("button", { name: `Remove your upvote from ${title}, 1 vote` })).toBeVisible()

  await page.getByRole("textbox", { name: "Comment" }).fill("Same on iOS.")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Same on iOS.")).toBeVisible()
  await page.getByRole("button", { name: "Reply" }).click()
  await page.getByRole("textbox", { name: /Reply to/ }).fill("Thanks for checking.")
  await page.getByRole("button", { name: "Send" }).last().click()
  await expect(page.getByText("Thanks for checking.")).toBeVisible()
  // Replies count: the comment and its reply.
  await expect(page.getByRole("heading", { name: "2 comments" })).toBeVisible()
})

test("similar requests show up while typing a title", async ({ page, request }) => {
  const id = unique()
  await seedRequest(request, `Export entries as markdown ${id}`)
  await page.goto("/feedback")
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("dialog").getByLabel("Email").fill(`similar-${id}@example.com`)
  await page.getByRole("dialog").getByLabel("Password").fill("correcthorse")
  await page.getByRole("dialog").getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  await page.getByRole("button", { name: "Suggest something" }).click()
  await page.getByRole("dialog").getByLabel("Title").fill(`markdown ${id}`)
  await expect(page.getByText("Is it one of these? A dot counts the same as a new post.")).toBeVisible()
  await expect(page.getByRole("dialog").getByText(`Export entries as markdown ${id}`)).toBeVisible()
})

test("an idea on a board that needs approval waits, visible only to its author", async ({ page, browser }) => {
  const id = unique()
  const title = `Crash on paste ${id}`
  await page.goto("/feedback")
  await page.getByRole("button", { name: "Suggest something" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email").fill(`approval-${id}@example.com`)
  await dialog.getByLabel("Password").fill("correcthorse")
  await dialog.getByRole("button", { name: "Create account" }).click()
  await dialog.getByRole("button", { name: "Bugs" }).click()
  await dialog.getByLabel("Title").fill(title)
  await dialog.getByRole("textbox", { name: "Details" }).fill("It crashes when I paste a long screenshot.")
  await dialog.getByRole("button", { name: "Send" }).click()
  await page.waitForURL(/\/feedback\/[a-z0-9]+$/)

  await page.goto("/feedback")
  await expect(page.getByRole("article").filter({ hasText: title }).getByText("Waiting for approval")).toBeVisible()

  const stranger = await browser.newPage()
  await stranger.goto("/feedback")
  await expect(stranger.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(stranger.getByText(title)).toHaveCount(0)
  await stranger.close()
})

test("filters live in the URL", async ({ page }) => {
  await page.goto("/feedback")
  await page.getByRole("tab", { name: "Newest" }).click()
  await page.waitForURL(/sort=newest/)
  await page.reload()
  await expect(page.getByRole("tab", { name: "Newest" })).toHaveAttribute("aria-selected", "true")
})
