import { createRef } from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Image from "@tiptap/extension-image"
import { Markdown } from "@tiptap/markdown"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { describe, expect, it, vi } from "vitest"
import { LINK_ERROR, linkAllowed } from "@/components/dashboard/changelog/editor/format-menu"
import { dropForeignImages, imageProblem } from "@/components/dashboard/changelog/editor/images"
import { completionLabel, completionTitles, PublishMenu, type PublishMenuProps } from "@/components/dashboard/changelog/editor/publish-menu"
import { BLOCKS, filterBlocks, SlashMenu, type SlashMenuHandle } from "@/components/dashboard/changelog/editor/slash-menu"
import { SlugField } from "@/components/dashboard/changelog/editor/slug-field"
import type { RequestItem } from "@/lib/api"

// cmdk measures its list and scrolls to the active item; jsdom has neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}

describe("SlugField", () => {
  it("sends nothing when tabbed through, and the cleaned value when edited", async () => {
    const onCommit = vi.fn()
    render(
      <>
        <SlugField slug="dark-mode" fixed={false} editable onCommit={onCommit} />
        <button>after</button>
      </>
    )
    const field = screen.getByRole("textbox", { name: "Post address" })
    await userEvent.click(field)
    await userEvent.tab()
    expect(onCommit).not.toHaveBeenCalled()

    await userEvent.clear(field)
    await userEvent.type(field, "Dark Mode Launch!")
    expect(field).toHaveValue("dark-mode-launch")
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith("dark-mode-launch")
  })

  it("sends an empty address to hand it back to the title", async () => {
    const onCommit = vi.fn()
    render(<SlugField slug="dark-mode-launch" fixed={false} editable onCommit={onCommit} />)
    await userEvent.clear(screen.getByRole("textbox", { name: "Post address" }))
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith("")
  })

  it("is read-only once published, and shows server errors", () => {
    const { rerender } = render(<SlugField slug="dark-mode" fixed editable onCommit={vi.fn()} />)
    expect(screen.getByRole("textbox", { name: "Post address" })).toHaveAttribute("readonly")
    expect(screen.getByText("The address is fixed once a post has been published.")).toBeInTheDocument()
    rerender(<SlugField slug="dark-mode" fixed={false} editable error="Another post already uses this address." onCommit={vi.fn()} />)
    expect(screen.getByRole("textbox", { name: "Post address" })).toHaveAccessibleDescription("Another post already uses this address.")
  })
})

describe("slash menu", () => {
  it("filters by the typed query", () => {
    expect(filterBlocks("").map((b) => b.title)).toEqual(BLOCKS.map((b) => b.title))
    expect(filterBlocks("bul").map((b) => b.title)).toEqual(["Bulleted list"])
    expect(filterBlocks("li").map((b) => b.title)).toEqual(["Bulleted list", "Numbered list"])
    expect(filterBlocks("zz")).toEqual([])
  })

  it("moves with the arrow keys and picks with Enter", () => {
    const command = vi.fn()
    const ref = createRef<SlashMenuHandle>()
    render(<SlashMenu ref={ref} items={BLOCKS} command={command} />)
    expect(screen.getByRole("listbox", { name: "Insert a block" })).toBeInTheDocument()
    act(() => {
      ref.current!.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }))
      ref.current!.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }))
    })
    act(() => {
      ref.current!.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }))
    })
    expect(command).toHaveBeenCalledWith(BLOCKS[2])
    expect(BLOCKS[2].title).toBe("Numbered list")
    expect(ref.current!.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(false)
  })

  it("inserts the picked block into the editor", () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown], content: "/", contentType: "markdown" })
    const range = { from: 1, to: 2 }
    BLOCKS.find((b) => b.id === "numbers")!.run(editor, range, { onImage: vi.fn() })
    expect(editor.getMarkdown().trim()).toBe("1.")
    const onImage = vi.fn()
    editor.commands.setContent("/", { contentType: "markdown" })
    BLOCKS.find((b) => b.id === "image")!.run(editor, range, { onImage })
    expect(onImage).toHaveBeenCalled()
    editor.destroy()
  })
})

describe("formatting", () => {
  const make = (md: string) =>
    new Editor({ extensions: [StarterKit, Image.configure({ allowBase64: false }), Markdown], content: md, contentType: "markdown" })

  it("toggles bold and italic", () => {
    const editor = make("Dark mode")
    editor.commands.setTextSelection({ from: 1, to: 5 })
    editor.commands.toggleBold()
    editor.commands.setTextSelection({ from: 6, to: 10 })
    editor.commands.toggleItalic()
    expect(editor.getMarkdown().trim()).toBe("**Dark** *mode*")
    editor.destroy()
  })

  it("refuses javascript: links", () => {
    expect(linkAllowed("https://example.com")).toBe(true)
    expect(linkAllowed("mailto:hi@example.com")).toBe(true)
    expect(linkAllowed("/roadmap")).toBe(true)
    expect(linkAllowed("javascript:alert(1)")).toBe(false)
    expect(linkAllowed("//evil.example")).toBe(false)
    expect(LINK_ERROR).toBe("Use a web address, like https://example.com.")
  })

  it("saves alt text as markdown", () => {
    const editor = make("![](/api/files/changelogs/p1/a.png)")
    let pos = 0
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === "image") pos = p
    })
    editor.commands.setNodeSelection(pos)
    editor.chain().updateAttributes("image", { alt: "Dark theme screenshot" }).run()
    expect(editor.getMarkdown().trim()).toBe("![Dark theme screenshot](/api/files/changelogs/p1/a.png)")
    editor.destroy()
  })

  it("drops pasted images that aren't the post's own files", () => {
    const editor = make("![](/api/files/changelogs/p1/a.png)\n\n![](https://evil.example/x.png)")
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size)
    const clean = dropForeignImages(slice, "p1")
    const srcs: string[] = []
    clean.content.descendants((n) => {
      if (n.type.name === "image") srcs.push(n.attrs.src)
    })
    expect(srcs).toEqual(["/api/files/changelogs/p1/a.png"])
    editor.destroy()
  })

  it("checks image type and size", () => {
    expect(imageProblem(new File(["x"], "a.png", { type: "image/png" }))).toBeNull()
    expect(imageProblem(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toBe("Images must be PNG, JPEG, WebP or GIF.")
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })
    expect(imageProblem(big)).toBe("That image is over 5 MB.")
  })
})

const req = (id: string, title: string, status: RequestItem["status"]) => ({ id, title, status }) as RequestItem

function renderMenu(over: Partial<PublishMenuProps> = {}) {
  const props: PublishMenuProps = {
    slug: "dark-mode",
    state: "draft",
    publishAt: null,
    attached: [],
    completeAttached: false,
    onCompleteChange: vi.fn(),
    disabled: false,
    onPublishNow: vi.fn(),
    onSchedule: vi.fn(),
    onUnschedule: vi.fn(),
    now: () => new Date(2026, 9, 22, 12, 0),
    ...over,
  }
  render(<PublishMenu {...props} />)
  return props
}

describe("PublishMenu", () => {
  it("names the address and publishes now", async () => {
    const p = renderMenu()
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    expect(await screen.findByText("/changelog/dark-mode")).toBeInTheDocument()
    expect(screen.getByText("Goes live on the changelog straight away.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Publish now/ }))
    expect(p.onPublishNow).toHaveBeenCalled()
  })

  it("schedules for tomorrow at 09:00, and refuses an empty or past time", async () => {
    const p = renderMenu()
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(await screen.findByRole("button", { name: /Schedule…/ }))
    expect(screen.getByText(/Times are in your time zone/)).toBeInTheDocument()
    const time = screen.getByLabelText("At")
    await userEvent.clear(time)
    expect(screen.getByRole("button", { name: /Schedule for 23 Oct/ })).toBeDisabled()
    expect(screen.getByText("Pick a time.")).toBeInTheDocument()

    await userEvent.type(time, "09:00")
    await userEvent.click(screen.getByRole("button", { name: "Schedule for 23 Oct" }))
    const at = (p.onSchedule as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([23, 9, 0])
  })

  it("disables a past time today", async () => {
    renderMenu()
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(await screen.findByRole("button", { name: /Schedule…/ }))
    await userEvent.click(screen.getByRole("button", { name: /^22 October 2026/ }))
    expect(screen.getByRole("button", { name: "Schedule for 22 Oct" })).toBeDisabled()
    expect(screen.getByText("Pick a time in the future.")).toBeInTheDocument()
  })

  it("offers the completion box only with completable requests, unchecked, naming them", async () => {
    renderMenu({ attached: [req("a", "Done one", "completed")] })
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await screen.findByText("/changelog/dark-mode")
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("shows the singular and plural copy and the titles that change", async () => {
    expect(completionLabel(1)).toBe("Also mark the attached request as Completed when it goes live")
    expect(completionLabel(2)).toBe("Also mark the 2 attached requests as Completed when it goes live")
    const many = ["A one", "B two", "C three", "D four", "E five"].map((t, i) => req(String(i), t, "planned"))
    expect(completionTitles(many)).toBe("A one, B two, C three and 2 more")
    const onCompleteChange = vi.fn()
    renderMenu({ attached: [req("a", "Dark mode", "planned"), req("b", "Faster search", "reviewing"), req("c", "Old", "closed")], onCompleteChange })
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    const box = await screen.findByRole("checkbox", { name: "Also mark the 2 attached requests as Completed when it goes live" })
    expect(box).not.toBeChecked()
    expect(screen.getByText("Dark mode, Faster search")).toBeInTheDocument()
    await userEvent.click(box)
    expect(onCompleteChange).toHaveBeenCalledWith(true)
  })

  it("reads Scheduled with Change the time and Unschedule", async () => {
    const p = renderMenu({ state: "scheduled", publishAt: new Date(2026, 9, 23, 9, 0).toISOString() })
    await userEvent.click(screen.getByRole("button", { name: /Scheduled · 23 Oct, 09:00/ }))
    expect(await screen.findByRole("button", { name: /Change the time…/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Unschedule/ }))
    expect(p.onUnschedule).toHaveBeenCalled()
  })
})
