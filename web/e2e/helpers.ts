import { readFileSync } from "node:fs"
import { join } from "node:path"

import AxeBuilder from "@axe-core/playwright"
import { expect, type APIRequestContext, type Page } from "@playwright/test"

export const API = "http://127.0.0.1:4052"

// The e2e admin lives in test/e2e.env, which the scripts that start Lort read too.
const e2eEnv = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", "..", "test", "e2e.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
)
export const ADMIN = { email: e2eEnv.LORT_ADMIN_EMAIL, password: e2eEnv.LORT_ADMIN_PASSWORD }

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

/** The admin's board profile token (a users record with isAdmin), for acting as the team on the record API. */
export async function teamToken(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/api/lort/team/me`, { headers: { Authorization: await adminToken(request) } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).token
}

/** Applies triage actions to a request as the team. */
export async function triage(request: APIRequestContext, id: string, ...actions: string[]) {
  const token = await adminToken(request)
  for (const action of actions) {
    const res = await request.post(`${API}/api/lort/requests/${id}/status`, { headers: { Authorization: token }, data: { action } })
    expect(res.ok(), `${action}: ${await res.text()}`).toBeTruthy()
  }
}

const TO_ROADMAP = {
  planned: ["accept", "roadmap"],
  progress: ["accept", "roadmap", "start"],
  completed: ["accept", "roadmap", "start", "complete"],
}

/** Moves a pending request onto the roadmap, as the triage bar would. */
export async function putOnRoadmap(request: APIRequestContext, id: string, to: keyof typeof TO_ROADMAP) {
  await triage(request, id, ...TO_ROADMAP[to])
}

/** A seeded request that is already in a roadmap column. */
export async function seedRoadmapRequest(request: APIRequestContext, title: string, to: keyof typeof TO_ROADMAP, board?: string) {
  const seeded = await seedRequest(request, title, board)
  await putOnRoadmap(request, seeded.id, to)
  return seeded
}

/** An internal (hidden) request the team created straight into a roadmap column. */
export async function seedHiddenRoadmapRequest(request: APIRequestContext, title: string, to: "planned" | "progress") {
  const res = await request.post(`${API}/api/collections/requests/records`, {
    headers: { Authorization: await teamToken(request) },
    data: { board: (await boardIds(request)).features, title, internal: true, roadmapStatus: to },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).id as string
}

/** Sets roadmapPublic straight through the API, to put things back after a test that flipped it. */
export async function setRoadmapPublic(request: APIRequestContext, on: boolean) {
  const token = await adminToken(request)
  const list = await (await request.get(`${API}/api/collections/settings/records`, { headers: { Authorization: token } })).json()
  const res = await request.patch(`${API}/api/collections/settings/records/${list.items[0].id}`, {
    headers: { Authorization: token },
    data: { roadmapPublic: on },
  })
  expect(res.ok()).toBeTruthy()
}

/** A roadmap move made by "a teammate", straight through the API. */
export async function moveViaApi(request: APIRequestContext, id: string, from: string, to: string) {
  const res = await request.post(`${API}/api/lort/requests/${id}/roadmap`, {
    headers: { Authorization: await adminToken(request) },
    data: { from, to },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}
