// Runs once after both servers are up: turns Lort's rate limits off (sign-up allows 3 per minute
// per IP, which the suite exceeds) and seeds the boards, tags and app name the specs expect.
// schema.Ensure turns the limits back on at every boot, so a normal run is unaffected.
import { ADMIN, API } from "./helpers"

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: init.token } : {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

export default async function globalSetup() {
  const { token } = await call("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: ADMIN.email, password: ADMIN.password }),
  })
  await call("/api/settings", { method: "PATCH", token, body: JSON.stringify({ rateLimits: { enabled: false } }) })

  const boards = await call("/api/collections/boards/records", { token })
  if (boards.totalItems === 0) {
    for (const b of [
      { name: "Features", order: 0, isPublic: true, requireApproval: false },
      { name: "Bugs", order: 1, isPublic: true, requireApproval: true },
    ]) {
      await call("/api/collections/boards/records", { method: "POST", token, body: JSON.stringify(b) })
    }
    for (const [i, name] of ["ios", "ui"].entries()) {
      await call("/api/collections/tags/records", { method: "POST", token, body: JSON.stringify({ name, order: i }) })
    }
  }
  const settings = await call("/api/collections/settings/records", { token })
  await call(`/api/collections/settings/records/${settings.items[0].id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ appName: "Driftnote", showLandingCard: true }),
  })
}
