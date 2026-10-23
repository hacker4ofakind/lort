import { describe, expect, it } from "vitest"
import { postMetadata } from "@/lib/post-metadata"

function encode(v: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

describe("postMetadata", () => {
  it("turns the proxy header into title, description and a large share image", () => {
    const m = postMetadata(
      encode({
        title: "Dark mode ✨",
        description: "It's here.",
        url: "https://f.example/changelog/dark-mode",
        image: "https://f.example/changelog-card/dark-mode",
        appName: "Driftnote",
      })
    )
    expect(m.title).toBe("Dark mode ✨")
    expect(m.description).toBe("It's here.")
    expect(m.openGraph).toMatchObject({
      type: "article",
      url: "https://f.example/changelog/dark-mode",
      images: [{ url: "https://f.example/changelog-card/dark-mode", width: 1200, height: 630 }],
    })
    expect(m.twitter).toMatchObject({ card: "summary_large_image" })
  })

  it("leaves the layout's defaults without the header", () => {
    expect(postMetadata(null)).toEqual({})
    expect(postMetadata("%%%")).toEqual({})
  })
})
