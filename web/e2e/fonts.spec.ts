import { expect, test } from "@playwright/test"

// The fonts ship in the repo (app/fonts): headings are Bricolage Grotesque, everything else Figtree,
// and no request leaves for Google Fonts.
test("headings and body use the self-hosted fonts", async ({ page }) => {
  const external: string[] = []
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url())
  })
  await page.goto("/feedback")
  const heading = page.getByRole("heading", { level: 1 })
  await expect(heading).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const family = (el: Element) => getComputedStyle(el).fontFamily
  expect(await heading.evaluate(family)).toMatch(/^"?bricolage"?/)
  expect(await page.locator("body").evaluate(family)).toMatch(/^"?figtree"?/)
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replaceAll('"', "")),
  )
  expect(loaded).toEqual(expect.arrayContaining(["bricolage", "figtree"]))
  expect(external).toEqual([])
})
