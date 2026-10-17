import { ClientResponseError } from "pocketbase"
import { describe, expect, it } from "vitest"
import { errorMessage, isAbort, isAuthError } from "@/lib/errors"

const err = (status: number, response: object = {}, isAbort = false) =>
  new ClientResponseError({ status, response, isAbort })

describe("errorMessage", () => {
  it("is friendly for rate limits and lost connections", () => {
    expect(errorMessage(err(429))).toBe("Slow down a little. Try again in a minute.")
    expect(errorMessage(err(0))).toBe("Couldn't reach the board. Check your connection and try again.")
  })

  it("names the field problem, then the server's message", () => {
    expect(
      errorMessage(err(400, { message: "Failed.", data: { title: { message: "Must be at least 3 characters." } } }))
    ).toBe("Must be at least 3 characters.")
    expect(errorMessage(err(403, { message: "Your account can't vote on this board." }))).toBe(
      "Your account can't vote on this board."
    )
    expect(errorMessage(new Error("Plain"))).toBe("Plain")
    expect(errorMessage("weird", "Fallback.")).toBe("Fallback.")
  })
})

describe("error kinds", () => {
  it("tells aborts and auth failures apart from blips", () => {
    expect(isAbort(err(0, {}, true))).toBe(true)
    expect(isAbort(err(0))).toBe(false)
    expect(isAuthError(err(401))).toBe(true)
    expect(isAuthError(err(403))).toBe(true)
    expect(isAuthError(err(0, {}, true))).toBe(false)
    expect(isAuthError(err(500))).toBe(false)
  })
})
