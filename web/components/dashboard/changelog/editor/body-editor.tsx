"use client"

import { useEffect, useRef, useState } from "react"
import Image from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extensions"
import { Markdown } from "@tiptap/markdown"
import { EditorContent, Extension, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { toast } from "sonner"
import { FormatMenu, linkAllowed } from "@/components/dashboard/changelog/editor/format-menu"
import { dropForeignImages, IMAGE_TYPES, imageProblem } from "@/components/dashboard/changelog/editor/images"
import { SlashCommand } from "@/components/dashboard/changelog/editor/slash-menu"
import { postFileUrl } from "@/lib/changelog"
import { PROSE } from "@/lib/prose"
import { cn } from "@/lib/utils"

const Shortcuts = Extension.create<{ onLink: () => void }>({
  name: "postShortcuts",
  addOptions() {
    return { onLink: () => {} }
  },
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        if (!this.editor.isEditable || this.editor.state.selection.empty) return false
        this.options.onLink()
        return true
      },
    }
  },
})

/** A callback the editor's extensions hold from the start and the component fills in later. */
function callbackSlot() {
  let fn = () => {}
  return { set: (f: () => void) => void (fn = f), call: () => fn() }
}

export interface BodyEditorProps {
  postId: string
  /** The markdown to load; it is read on mount and whenever version changes (a reseed). */
  markdown: string
  version: number
  editable: boolean
  onChange: (markdown: string) => void
  upload: (file: File) => Promise<string>
  /** The editor, once it exists, for the publish menu and the title's Enter. */
  onReady?: (editor: Editor | null) => void
}

/**
 * The post body: Tiptap storing markdown. It saves only when the markdown really changed, so
 * loading (or a round trip that rewrites the text) never fires a save on its own.
 */
export function BodyEditor({ postId, markdown, version, editable, onChange, upload, onReady }: BodyEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [altFocus, setAltFocus] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const insertAt = useRef(0)
  const lastSaved = useRef<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const latest = useRef({ onChange, upload })
  useEffect(() => {
    latest.current = { onChange, upload }
  })
  const [imageSlot] = useState(callbackSlot)
  useEffect(() =>
    imageSlot.set(() => {
      insertAt.current = editorRef.current?.state.selection.from ?? 0
      fileInput.current?.click()
    })
  )

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content: markdown,
    contentType: "markdown",
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          // Web, mail and site links only; a bare "example.com" gets the default protocol.
          isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && (linkAllowed(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url)),
        },
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Type / for blocks" }),
      Markdown,
      SlashCommand.configure({ onImage: imageSlot.call }),
      Shortcuts.configure({ onLink: () => setLinkOpen(true) }),
    ],
    editorProps: {
      attributes: {
        class: cn(
          PROSE,
          // A writing surface: the caret shows where focus is, so no frame around it.
          "min-h-[40vh] max-w-none pb-10 focus-visible:outline-none",
          "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]",
          "[&_img.ProseMirror-selectednode]:outline-3 [&_img.ProseMirror-selectednode]:outline-offset-3 [&_img.ProseMirror-selectednode]:outline-focus"
        ),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Post body",
      },
      transformPasted: (slice) => dropForeignImages(slice, postId),
    },
    onCreate: ({ editor: e }) => {
      lastSaved.current = e.getMarkdown()
    },
    onUpdate: ({ editor: e }) => {
      const md = e.getMarkdown()
      if (md === lastSaved.current) return
      lastSaved.current = md
      latest.current.onChange(md)
    },
  })
  useEffect(() => {
    editorRef.current = editor
    onReady?.(editor)
  }, [editor, onReady])

  useEffect(() => {
    editor?.setEditable(editable, false)
  }, [editor, editable])

  // A reseed (Reload, Undo, the post went live) replaces the text without saving it back.
  const loaded = useRef(version)
  useEffect(() => {
    if (!editor || version === loaded.current) return
    loaded.current = version
    editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false })
    lastSaved.current = editor.getMarkdown()
  }, [editor, version, markdown])

  const pick = async (file: File | undefined) => {
    if (!file || !editor) return
    const problem = imageProblem(file)
    if (problem) {
      toast(problem)
      return
    }
    const at = insertAt.current
    try {
      const name = await latest.current.upload(file)
      const src = postFileUrl(postId, name)
      const pos = Math.min(at, editor.state.doc.content.size)
      editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src, alt: "" } }).run()
      // The image may land elsewhere than pos (it replaces an empty paragraph), so find it.
      let found = -1
      editor.state.doc.descendants((n, p) => {
        if (n.type.name === "image" && n.attrs.src === src) found = p
      })
      if (found >= 0) editor.commands.setNodeSelection(found)
      // Alt text is the natural next step: the toolbar's field mounts focused.
      setAltFocus((n) => n + 1)
    } catch (err) {
      if (err instanceof Error && err.message !== "Discarded.") toast(err.message)
    }
  }

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <FormatMenu editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} altFocus={altFocus} />}
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />
    </>
  )
}
