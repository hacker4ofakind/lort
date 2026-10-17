import AxeBuilder from "@axe-core/playwright"
import { expect, type APIRequestContext, type Page } from "@playwright/test"

export const API = "http://127.0.0.1:4052"
export const ADMIN = { email: "admin@lort.test", password: "correcthorse-e2e" }

/** A suffix that keeps names unique across tests and both theme projects. */
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/collections/_superusers/auth-with-password`, {
    data: { identity: ADMIN.email, password: ADMIN.password },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).token
}

export async function boardIds(request: APIRequestContext): Promise<{ features: string; bugs: string }> {
  const token = await adminToken(request)
  const res = await request.get(`${API}/api/collections/boards/records?sort=order`, { headers: { Authorization: token } })
  const items: Array<{ id: string; name: string }> = (await res.json()).items
  return { features: items.find((b) => b.name === "Features")!.id, bugs: items.find((b) => b.name === "Bugs")!.id }
}

/** A board user and a request of theirs, made through the API (faster than the UI where the UI isn't under test). */
export async function seedRequest(request: APIRequestContext, title: string, board?: string): Promise<{ id: string; token: string }> {
  const email = `seed-${unique()}@example.com`
  await request.post(`${API}/api/collections/users/records`, {
    data: { email, password: "correcthorse", passwordConfirm: "correcthorse" },
  })
  const auth = await (
    await request.post(`${API}/api/collections/users/auth-with-password`, { data: { identity: email, password: "correcthorse" } })
  ).json()
  const res = await request.post(`${API}/api/collections/requests/records`, {
    headers: { Authorization: auth.token },
    data: { board: board ?? (await boardIds(request)).features, title, body: `Details for ${title}.` },
  })
  expect(res.ok()).toBeTruthy()
  return { id: (await res.json()).id, token: auth.token }
}

export async function signInAdmin(page: Page) {
  await page.goto("/dashboard/login")
  await page.getByLabel("Email").fill(ADMIN.email)
  await page.getByLabel("Password").fill(ADMIN.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(/\/dashboard\/requests/)
}

/** axe on the current page: no WCAG 2.2 A/AA violations. */
export async function expectAccessible(page: Page) {
  // Let opening animations (dialogs fade and zoom in over 150 ms) finish first: axe measures
  // contrast on what's painted, and a half-faded dialog reads as low contrast. Infinite
  // animations (skeleton bones) never finish, so they're skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  )
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  if (process.env.AXE_DEBUG)
    for (const v of results.violations)
      for (const n of v.nodes) console.log(`[axe] ${page.url()} ${v.id}\n${n.html}\n${n.failureSummary}\n`)
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
}
