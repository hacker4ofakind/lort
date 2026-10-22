import { expect, test, type Page } from "@playwright/test"
import { API, adminToken, putOnRoadmap, seedPost, seedRequest, signInAdmin, unique } from "./helpers"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** Opens a new post in the editor and returns its id. */
async function newPost(page: Page): Promise<string> {
  await page.goto("/dashboard/changelog")
  await page.getByRole("button", { name: "New post" }).click()
  await page.waitForURL(/\/dashboard\/changelog\/[a-z0-9]{15}$/)
  await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible()
  return page.url().split("/").pop()!
}

const body = (page: Page) => page.getByRole("textbox", { name: "Post body" })

async function waitSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 })
}

async function publishNow(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  await page.getByRole("button", { name: /Publish now/ }).click()
}

test.describe("changelog editor", () => {
  test("writes a post with the slash menu, a label and an attached request, and keeps it after a reload", async ({ page, request }) => {
    const u = unique()
    await seedRequest(request, `Attach me ${u}`)
    await signInAdmin(page)
    await newPost(page)

    await page.getByRole("textbox", { name: "Title" }).fill(`Dark mode ${u}`)
    await page.getByRole("textbox", { name: "Title" }).press("Enter")
    await page.keyboard.type("It's here at last.")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/")
    await expect(page.getByRole("listbox", { name: "Insert a block" })).toBeVisible()
    await page.keyboard.press("Enter")
    await page.keyboard.type("What changed")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/bul")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Dark theme everywhere")
    await page.getByRole("button", { name: "New", exact: true }).click()
    await page.getByRole("button", { name: "Attach a request" }).click()
    await page.getByRole("combobox", { name: "Search requests" }).fill(`Attach me ${u}`)
    await page.getByRole("option", { name: new RegExp(`Attach me ${u}`) }).click()
    await waitSaved(page)
    await expect(page.getByRole("textbox", { name: "Post address" }).first()).toHaveValue(`dark-mode-${u}`)

    await page.reload()
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`Dark mode ${u}`)
    await expect(body(page).getByRole("heading", { level: 2, name: "What changed" })).toBeVisible()
    await expect(body(page).getByRole("listitem")).toHaveText("Dark theme everywhere")
    await expect(page.getByRole("button", { name: "New", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("region", { name: "Shipped in this update" })).toContainText(`Attach me ${u}`)
  })

  test("publishes now: the pill appears, the post is listed and has a share image", async ({ page, request }) => {
    const u = unique()
    const r = await seedRequest(request, `Shipped thing ${u}`)
    const { id, slug } = await seedPost(request, { title: `Faster search ${u}`, body: "Search is **twice** as fast.", labels: ["improved"], requests: [r.id] })
    await signInAdmin(page)
    await page.goto(`/dashboard/changelog/${id}`)
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`Faster search ${u}`)
    await publishNow(page)
    await expect(page.getByText("Published. It's live on the changelog.")).toBeVisible()
    await expect(page.getByText("This post is live. Unpublish it to make changes.")).toBeVisible()

    await page.goto("/feedback")
    await expect(page.getByRole("navigation", { name: "Board" }).getByRole("link", { name: "Changelog" })).toBeVisible()
    await page.goto("/changelog")
    await page.getByRole("link", { name: `Faster search ${u}` }).click()
    await page.waitForURL(`**/changelog/${slug}`)
    await expect(page.getByRole("article").getByText("twice")).toBeVisible()
    await expect(page.getByRole("region", { name: "Shipped in this update" }).getByRole("link", { name: `Shipped thing ${u}` })).toBeVisible()
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/changelog-card/${slug}$`))
    const card = await request.get(`/changelog-card/${slug}`)
    expect(card.headers()["content-type"]).toBe("image/png")
  })

  test("publishing with the completion box completes the attached Planned request", async ({ page, request }) => {
    const u = unique()
    const r = await seedRequest(request, `Planned for the post ${u}`)
    await putOnRoadmap(request, r.id, "planned")
    const { id } = await seedPost(request, { title: `Completion ${u}`, requests: [r.id] })
    await signInAdmin(page)
    await page.goto(`/dashboard/changelog/${id}`)
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`Completion ${u}`)
    await page.getByRole("button", { name: "Publish", exact: true }).click()
    const box = page.getByRole("checkbox", { name: "Also mark the attached request as Completed when it goes live" })
    await expect(box).not.toBeChecked()
    await box.click()
    await waitSaved(page)
    await page.getByRole("button", { name: /Publish now/ }).click()
    await expect(page.getByText("Published, and 1 request marked as completed.")).toBeVisible()
    await page.goto(`/feedback/${r.id}`)
    await expect(page.getByText(/Planned\s*→\s*Completed|Completed/).first()).toBeVisible()
    const res = await request.get(`${API}/api/lort/requests/${r.id}`)
    expect((await res.json()).status).toBe("completed")
  })

  test("unpublishing takes it off the changelog; republishing keeps the date and the address stays fixed", async ({ page, request }) => {
    test.slow()
    const u = unique()
    const { id, slug } = await seedPost(request, { title: `Unpublish me ${u}` }, true)
    const first = (await (await request.get(`${API}/api/lort/changelog/${slug}`)).json()).publishedAt
    await signInAdmin(page)
    await page.goto(`/dashboard/changelog/${id}`)
    await page.getByRole("button", { name: "Unpublish" }).click()
    await expect(page.getByText("Unpublished. It's a draft again.")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Title" })).not.toHaveAttribute("readonly")
    // The server is called when the 10-second window ends.
    await expect.poll(async () => (await request.get(`${API}/api/lort/changelog/${slug}`)).status(), { timeout: 20_000 }).toBe(404)
    await expect(page.getByRole("textbox", { name: "Post address" }).first()).toHaveAttribute("readonly")
    await expect(page.getByText("The address is fixed once a post has been published.").first()).toBeVisible()

    const visitor = await page.context().newPage()
    await visitor.goto(`/changelog/${slug}`)
    await expect(visitor.getByText("This post isn't here")).toBeVisible()
    await visitor.close()

    await publishNow(page)
    await expect(page.getByText("Published. It's live on the changelog.")).toBeVisible()
    const again = (await (await request.get(`${API}/api/lort/changelog/${slug}`)).json()).publishedAt
    expect(again).toBe(first)
  })

  test("a post scheduled a minute ahead goes live by itself", async ({ page, request }) => {
    test.slow()
    const u = unique()
    const { id } = await seedPost(request, { title: `Scheduled ${u}` })
    await signInAdmin(page)
    await page.goto(`/dashboard/changelog/${id}`)
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(`Scheduled ${u}`)
    const at = new Date(Date.now() + 70_000)
    await page.getByRole("button", { name: "Publish", exact: true }).click()
    await page.getByRole("button", { name: /Schedule…/ }).click()
    await page.getByRole("button", { name: new RegExp(`^${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`) }).click()
    await page.getByLabel("At", { exact: true }).fill(`${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`)
    await page.getByRole("button", { name: /^Schedule for / }).click()
    await expect(page.getByText(/^Scheduled for \d{2} [A-Z][a-z]{2}, \d{2}:\d{2}\.$/)).toBeVisible()

    await page.goto("/dashboard/changelog")
    const row = page.getByRole("row").filter({ hasText: `Scheduled ${u}` })
    await expect(row).toContainText(/Scheduled · \d{2} [A-Z][a-z]{2}, \d{2}:\d{2}/)
    await expect(async () => {
      await page.reload()
      await expect(row).toContainText("Published ·", { timeout: 1000 })
    }).toPass({ timeout: 150_000, intervals: [5000] })
  })

  test("unscheduling returns a post to drafts, and deleting a draft removes it", async ({ page, request }) => {
    const u = unique()
    const { id } = await seedPost(request, { title: `Later ${u}` })
    const token = await adminToken(request)
    const res = await request.post(`${API}/api/lort/changelogs/${id}/schedule`, {
      headers: { Authorization: token },
      data: { publishAt: new Date(Date.now() + 86_400_000).toISOString() },
    })
    expect(res.ok()).toBeTruthy()
    await signInAdmin(page)
    await page.goto(`/dashboard/changelog/${id}`)
    await page.getByRole("button", { name: /^Scheduled · / }).click()
    await page.getByRole("button", { name: /Unschedule/ }).click()
    await expect(page.getByText("Back in drafts.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible()

    await page.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: "Delete post" }).click()
    await expect(page.getByText(`Delete “Later ${u}”?`)).toBeVisible()
    await page.getByRole("button", { name: "Delete post" }).click()
    await page.waitForURL(/\/dashboard\/changelog$/)
    await expect(page.getByText("Post deleted.")).toBeVisible()
    await expect(page.getByRole("link", { name: `Later ${u}` })).toHaveCount(0)
  })
})

test("the public label filter follows the URL and Back", async ({ page, request }) => {
  const u = unique()
  await seedPost(request, { title: `Fixed thing ${u}`, labels: ["fixed"] }, true)
  await seedPost(request, { title: `New thing ${u}`, labels: ["new"] }, true)
  await page.goto("/changelog")
  await expect(page.getByRole("link", { name: `New thing ${u}` })).toBeVisible()
  await page.getByRole("group", { name: "Filter by label" }).getByRole("button", { name: "Fixed" }).click()
  await page.waitForURL(/\?label=fixed$/)
  await expect(page.getByRole("link", { name: `Fixed thing ${u}` })).toBeVisible()
  await expect(page.getByRole("link", { name: `New thing ${u}` })).toHaveCount(0)
  await page.getByRole("group", { name: "Filter by label" }).getByRole("button", { name: "New" }).click()
  await page.waitForURL(/\?label=new$/)
  await expect(page.getByRole("link", { name: `New thing ${u}` })).toBeVisible()
  await page.goBack()
  await page.waitForURL(/\?label=fixed$/)
  await expect(page.getByRole("link", { name: `Fixed thing ${u}` })).toBeVisible()
  await expect(page.getByRole("group", { name: "Filter by label" }).getByRole("button", { name: "Fixed" })).toHaveAttribute("aria-pressed", "true")
})

// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64")

test("an image from the slash menu lands in the body, selected, with its alt text field focused", async ({ page }) => {
  await signInAdmin(page)
  const id = await newPost(page)
  await page.getByRole("textbox", { name: "Title" }).fill(`Image ${unique()}`)
  await body(page).click()
  await page.keyboard.type("/ima")
  const chooser = page.waitForEvent("filechooser")
  await page.keyboard.press("Enter")
  await (await chooser).setFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG })
  await expect(body(page).locator("img")).toHaveAttribute("src", new RegExp(`^/api/files/changelogs/${id}/shot_`))
  const alt = page.getByRole("textbox", { name: "Alt text" })
  await expect(alt).toBeFocused()
  await alt.fill("A tiny dot")
  await page.waitForTimeout(1500)
  await waitSaved(page)
  await page.reload()
  await expect(body(page).locator("img")).toHaveAttribute("alt", "A tiny dot")
})
