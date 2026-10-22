"use client"

import { useState } from "react"
import { useEditorState, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { IconBold, IconItalic, IconLink } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"

export const LINK_ERROR = "Use a web address, like https://example.com."

/** A link may go to the web, to an email address or to a page on this site; nothing else. */
export function linkAllowed(url: string): boolean {
  const u = url.trim()
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(u) || (u.startsWith("/") && !u.startsWith("//"))
}

const iconToggle = "size-9 h-9 px-0 bg-transparent text-foreground data-pressed:shadow-none"

/**
 * The formatting toolbar over a text selection (bold, italic, link) or a selected image (alt
 * text). It follows the selection on touch screens too, and stays inside the viewport.
 */
export function FormatMenu({
  editor,
  linkOpen,
  onLinkOpenChange,
  altFocus,
}: {
  editor: Editor
  linkOpen: boolean
  onLinkOpenChange: (open: boolean) => void
  /** Rises when an upload lands, so the alt field mounts focused. */
  altFocus: number
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
      image: e.isActive("image"),
      alt: (e.getAttributes("image").alt as string | undefined) ?? "",
    }),
  })
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  // Opening the field (button or Mod-K) starts from the link under the selection.
  const [wasOpen, setWasOpen] = useState(linkOpen)
  if (wasOpen !== linkOpen) {
    setWasOpen(linkOpen)
    if (linkOpen) {
      setUrl(s.href)
      setError("")
    }
  }

  const openLink = () => onLinkOpenChange(true)
  const apply = () => {
    if (!linkAllowed(url)) {
      setError(LINK_ERROR)
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run()
    onLinkOpenChange(false)
  }
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    onLinkOpenChange(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, state }) => e.isEditable && (e.isActive("image") || !state.selection.empty || linkOpen)}
      className="z-40"
    >
      <div
        role="toolbar"
        aria-label="Format"
        className="flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-[16px] border border-border-strong bg-surface p-1.5 shadow-float"
      >
        {s.image ? (
          <label className="flex items-center gap-2 px-1.5">
            <span className="text-caption font-semibold text-muted-foreground">Alt text</span>
            <Input
              key={altFocus}
              autoFocus={altFocus > 0}
              aria-label="Alt text"
              placeholder="Describe the image for people who can't see it"
              value={s.alt}
              onChange={(e) => editor.chain().updateAttributes("image", { alt: e.target.value }).run()}
              className="h-9 w-[min(320px,60vw)]"
            />
          </label>
        ) : linkOpen ? (
          <form
            className="flex flex-wrap items-center gap-1.5 px-1"
            onSubmit={(e) => {
              e.preventDefault()
              apply()
            }}
          >
            <Input
              autoFocus
              aria-label="Link address"
              placeholder="https://"
              value={url}
              aria-invalid={!!error}
              aria-describedby={error ? "link-error" : undefined}
              onChange={(e) => {
                setUrl(e.target.value)
                setError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  onLinkOpenChange(false)
                  editor.commands.focus()
                }
              }}
              className="h-9 w-[min(260px,55vw)]"
            />
            <Button type="submit" size="sm">
              Apply
            </Button>
            {s.link && (
              <Button type="button" size="sm" variant="ghost" onClick={remove}>
                Remove link
              </Button>
            )}
            {error && (
              <p id="link-error" role="alert" className="w-full px-1 text-caption text-danger">
                {error}
              </p>
            )}
          </form>
        ) : (
          <>
            <Toggle aria-label="Bold" pressed={s.bold} onPressedChange={() => editor.chain().focus().toggleBold().run()} className={iconToggle}>
              <IconBold />
            </Toggle>
            <Toggle aria-label="Italic" pressed={s.italic} onPressedChange={() => editor.chain().focus().toggleItalic().run()} className={iconToggle}>
              <IconItalic />
            </Toggle>
            <Toggle aria-label="Link" pressed={s.link} onPressedChange={openLink} className={iconToggle}>
              <IconLink />
            </Toggle>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}
