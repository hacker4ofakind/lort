import { describe, expect, it } from "vitest"
import { newRequestPayload } from "@/components/board/suggest-dialog"

describe("newRequestPayload", () => {
  it("is a plain object so the SDK keeps booleans in @jsonPayload", () => {
    const img = new File(["x"], "a.png", { type: "image/png" })
    const p = newRequestPayload({
      board: "b1",
      title: "  Dark mode  ",
      body: "Please",
      tags: ["t1"],
      images: [img],
      internal: true,
      website: "",
    })
    expect(p).toEqual({ board: "b1", title: "Dark mode", body: "Please", tags: ["t1"], images: [img], internal: true, website: "" })
    expect(p).not.toBeInstanceOf(FormData)
  })

  it("names the person the team posts for, so the server makes them the author in the same save", () => {
    const base = { board: "b1", title: "Calendar view", body: "", tags: [], images: [], internal: false, website: "" }
    expect(newRequestPayload({ ...base, onBehalf: " priya@example.com " })).toMatchObject({ onBehalf: "priya@example.com" })
    expect(newRequestPayload({ ...base, onBehalf: "  " })).not.toHaveProperty("onBehalf")
    expect(newRequestPayload(base)).not.toHaveProperty("onBehalf")
  })
})
