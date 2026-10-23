import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LabelChips } from "@/components/board/changelog/label-chips"
import { Markdown } from "@/components/board/changelog/markdown"

describe("Markdown", () => {
  it("renders headings, lists, inline code and links", () => {
    render(<Markdown source={"## What changed\n\n- One\n- Two\n\nRun `lort` or see [the docs](https://docs.example.com)."} />)
    expect(screen.getByRole("heading", { level: 2, name: "What changed" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("lort").tagName).toBe("CODE")
    const link = screen.getByRole("link", { name: "the docs" })
    expect(link).toHaveAttribute("href", "https://docs.example.com")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("shows raw HTML as text and drops javascript: links", () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script>\n\n[click](javascript:alert(1))'} />)
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("<script>alert(1)</script>")
    expect(screen.getByText("click").closest("a")?.getAttribute("href") ?? "").toBe("")
  })

  it("renders only the post's own images, width-capped unless GIF", () => {
    const { container } = render(
      <Markdown
        source={
          "![shot](/api/files/changelogs/p1/a.png)\n\n![anim](/api/files/changelogs/p1/b.gif)\n\n![tracker](https://evil.example/pixel.png)"
        }
      />
    )
    const imgs = container.querySelectorAll("img")
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toHaveAttribute("src", "/api/files/changelogs/p1/a.png?thumb=1600x0")
    expect(imgs[0]).toHaveAttribute("alt", "shot")
    expect(imgs[0]).toHaveAttribute("loading", "lazy")
    expect(imgs[1]).toHaveAttribute("src", "/api/files/changelogs/p1/b.gif")
  })
})

describe("LabelChips", () => {
  it("lists labels in display order", () => {
    render(<LabelChips labels={["fixed", "new"]} />)
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["New", "Fixed"])
  })
})
