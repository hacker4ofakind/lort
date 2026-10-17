import { describe, expect, it } from "vitest"
import { needsFileToken } from "@/components/request/request-images"
import type { Comment, RequestDetail } from "@/lib/api"

const comment = (c: Partial<Comment>): Comment =>
  ({ id: "c", body: "", images: [], internal: false, created: "", replies: [], author: { id: "u", name: "Mara" }, ...c }) as Comment
const detail = (d: Partial<RequestDetail>) => ({ public: true, thread: [], ...d }) as unknown as RequestDetail

describe("needsFileToken", () => {
  it("asks for a token on a request that isn't public", () => {
    expect(needsFileToken(detail({ public: false }))).toBe(true)
  })

  it("asks for one on a public request when an internal note has images", () => {
    expect(needsFileToken(detail({ thread: [comment({ internal: true, images: ["a.png"] })] }))).toBe(true)
    expect(needsFileToken(detail({ thread: [comment({ replies: [comment({ internal: true, images: ["b.png"] })] })] }))).toBe(true)
  })

  it("needs none when every image is public", () => {
    expect(needsFileToken(detail({ thread: [comment({ images: ["a.png"] }), comment({ internal: true })] }))).toBe(false)
  })
})
