import { ClientResponseError } from "pocketbase"
import { describe, expect, it, vi } from "vitest"
import { renewSession, sessionAfterError, signOutAdmin } from "@/components/dashboard/session"
import { pb, pbAdmin } from "@/lib/pocketbase"

// /api/lort/team/me, answered by each test when it wants.
const me: { resolve: (value: unknown) => void; reject: (error: unknown) => void } = { resolve: () => {}, reject: () => {} }
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  teamMe: () => new Promise((resolve, reject) => Object.assign(me, { resolve, reject })),
}))

// A token PocketBase's isValid accepts: a JWT whose exp is an hour away.
function token(sub = "s") {
  const part = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, "")
  return `${part({ alg: "HS256" })}.${part({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

const err = (status: number, isAbort = false) => new ClientResponseError({ status, isAbort, response: {} })

describe("sessionAfterError", () => {
  it("signs out only when the server rejects the session", () => {
    expect(sessionAfterError(err(401))).toBe("sign-out")
    expect(sessionAfterError(err(403))).toBe("sign-out")
    expect(sessionAfterError(err(0, true))).toBe("keep") // the admin navigated away mid-fetch
    expect(sessionAfterError(err(0))).toBe("keep") // a network blip
    expect(sessionAfterError(err(500))).toBe("keep")
  })
})

describe("renewing the board profile", () => {
  it("doesn't link a profile for a session that signed out meanwhile", async () => {
    pbAdmin.authStore.save(token(), { id: "s1", collectionName: "_superusers" } as never)
    const renewing = renewSession()
    signOutAdmin()
    me.resolve({ token: token(), profile: { id: "u1", collectionName: "users", name: "Luk" } })
    await renewing
    expect(pb.authStore.isValid).toBe(false)
  })

  it("lets a stale rejection sign out only the session that sent it", async () => {
    pbAdmin.authStore.save(token(), { id: "s1", collectionName: "_superusers" } as never)
    const renewing = renewSession()
    const newer = token("newer")
    pbAdmin.authStore.save(newer, { id: "s2", collectionName: "_superusers" } as never)
    me.reject(err(401))
    expect(await renewing).toBe("kept")
    expect(pbAdmin.authStore.token).toBe(newer)
  })

  it("signs out the session the server rejected", async () => {
    pbAdmin.authStore.save(token(), { id: "s1", collectionName: "_superusers" } as never)
    const renewing = renewSession()
    me.reject(err(401))
    expect(await renewing).toBe("signed-out")
    expect(pbAdmin.authStore.isValid).toBe(false)
  })
})
