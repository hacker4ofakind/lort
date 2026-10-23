"use client"

import { forwardRef, useImperativeHandle, useState, type ComponentType } from "react"
import { PluginKey } from "@tiptap/pm/state"
import { Extension, ReactRenderer, type Editor, type Range } from "@tiptap/react"
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion"
import { IconCode, IconH2, IconList, IconListNumbers, IconPhoto, IconQuote, IconSeparator } from "@tabler/icons-react"
import { Command, CommandItem, CommandList } from "@/components/ui/command"

export interface Block {
  id: string
  title: string
  icon: ComponentType<{ className?: string }>
  run: (editor: Editor, range: Range, options: SlashOptions) => void
}

export interface SlashOptions {
  /** Image opens a file picker; the editor inserts the upload where the slash was. */
  onImage: () => void
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

/** The slash menu's blocks, in menu order. */
export const BLOCKS: Block[] = [
  { id: "heading", title: "Heading", icon: IconH2, run: (e, r) => chain(e, r).setNode("heading", { level: 2 }).run() },
  { id: "bullets", title: "Bulleted list", icon: IconList, run: (e, r) => chain(e, r).toggleBulletList().run() },
  { id: "numbers", title: "Numbered list", icon: IconListNumbers, run: (e, r) => chain(e, r).toggleOrderedList().run() },
  {
    id: "image",
    title: "Image",
    icon: IconPhoto,
    run: (e, r, o) => {
      chain(e, r).run()
      o.onImage()
    },
  },
  { id: "quote", title: "Quote", icon: IconQuote, run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { id: "code", title: "Code", icon: IconCode, run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { id: "divider", title: "Divider", icon: IconSeparator, run: (e, r) => chain(e, r).setHorizontalRule().run() },
]

/** The blocks whose name has a word starting with the typed query ("bul" finds Bulleted list). */
export function filterBlocks(query: string): Block[] {
  const q = query.trim().toLowerCase()
  if (!q) return BLOCKS
  return BLOCKS.filter((b) => b.title.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
}

export interface SlashMenuHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

interface SlashMenuProps {
  items: Block[]
  command: (b: Block) => void
}

/**
 * The block list. The editor keeps focus while it is open, so the suggestion forwards the arrow
 * keys and Enter here (onKeyDown) and this keeps the highlighted option.
 */
export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu({ items, command }, ref) {
  const [active, setActive] = useState(0)
  const [prevItems, setPrevItems] = useState(items)
  if (prevItems !== items) {
    setPrevItems(items)
    setActive(0)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (items.length === 0) return false
      if (e.key === "ArrowDown") {
        setActive((i) => (i + 1) % items.length)
        return true
      }
      if (e.key === "ArrowUp") {
        setActive((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (e.key === "Enter") {
        command(items[Math.min(active, items.length - 1)])
        return true
      }
      return false
    },
  }))

  if (items.length === 0) return null
  const current = items[Math.min(active, items.length - 1)]
  return (
    <Command
      value={current.id}
      onValueChange={(v) => setActive(Math.max(0, items.findIndex((b) => b.id === v)))}
      shouldFilter={false}
      // 14px outside, 4px padding and a 1px border: the items' own corners are 14 - 4 - 1 = 9px.
      className="w-[220px] rounded-[14px]! border border-border-strong bg-surface p-1 shadow-float"
    >
      <CommandList label="Insert a block" className="max-h-[min(360px,50vh)]">
        {items.map((b) => (
          <CommandItem
            key={b.id}
            value={b.id}
            onSelect={() => command(b)}
            onMouseDown={(e) => e.preventDefault()}
            className="h-8 gap-2.5 rounded-[9px] px-2 text-[14px] font-normal data-[selected=true]:bg-surface-2"
          >
            <b.icon className="size-4 text-muted-foreground" />
            {b.title}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
})

export const slashKey = new PluginKey("slash")

/** "/" at the start of a line opens the block menu. */
export const SlashCommand = Extension.create<SlashOptions>({
  name: "slashCommand",
  addOptions() {
    return { onImage: () => {} }
  },
  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion<Block, Block>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        startOfLine: true,
        allowSpaces: false,
        placement: "bottom-start",
        offset: { mainAxis: 8 },
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }) => props.run(editor, range, options),
        render: () => {
          let component: ReactRenderer<SlashMenuHandle, SlashMenuProps> | undefined
          let unmount: (() => void) | null = null
          return {
            onStart(props: SuggestionProps<Block, Block>) {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              component.element.classList.add("z-50")
              unmount = props.mount(component.element)
            },
            onUpdate(props: SuggestionProps<Block, Block>) {
              component?.updateProps({ items: props.items, command: props.command })
            },
            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === "Escape") {
                // Closes the menu and leaves the "/" as text.
                exitSuggestion(props.view, slashKey)
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit() {
              unmount?.()
              unmount = null
              component?.destroy()
              component = undefined
            },
          }
        },
      }),
    ]
  },
})
