import { ClientResponseError } from "pocketbase"
import { describe, expect, it } from "vitest"
import { sessionAfterError } from "@/components/dashboard/session"

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
