import { describe, expect, it } from "vitest"
import { validateAuth } from "@/components/board/auth-form"

describe("validateAuth", () => {
  it("asks for a real email and an 8-character password on sign-up", () => {
    expect(validateAuth("mara", "short", "signup")).toEqual({
      email: "Enter an email address like name@example.com.",
      password: "Use at least 8 characters.",
    })
    expect(validateAuth("mara@example.com", "correcthorse", "signup")).toEqual({})
    expect(validateAuth("mara@example.com", "", "signin")).toEqual({ password: "Enter your password." })
  })
})
