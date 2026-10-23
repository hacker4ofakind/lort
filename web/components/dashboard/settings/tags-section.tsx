"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconGripVertical, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingsSection } from "@/components/dashboard/settings/section"
import { useCatalogRefresh } from "@/components/dashboard/settings/use-settings"
import { useTags, type Tag } from "@/components/dashboard/use-boards"
import { Bone } from "@/components/lort/bone"
import { chipClass } from "@/components/lort/chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { setOrder } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { cn } from "@/lib/utils"

/** Tags: add, rename, reorder (drag the grip, or focus it and use the arrow keys), delete. */
export function TagsSection() {
  const qc = useQueryClient()
  const tags = useTags()
  const refresh = useCatalogRefresh()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Instant, not dnd-kit's default smooth scroll: a smooth scroll is still running when the
      // next arrow press arrives, so quick presses would restart it and the row would never move.
      // It also honours reduced motion.
      scrollBehavior: "auto",
    })
  )
  const list = tags.data ?? []

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = arrayMove(
      list,
      list.findIndex((t) => t.id === active.id),
      list.findIndex((t) => t.id === over.id)
    )
    qc.setQueryData(keys.tags, next)
    try {
      await setOrder(pbAdmin, "tags", next.map((t) => t.id))
    } catch (err) {
      toast(errorMessage(err))
    }
    await refresh()
  }

  return (
    <SettingsSection id="tags" title="Tags">
      <div className="flex flex-wrap gap-2">
        {tags.isPending ? (
          [64, 48, 72].map((w) => <Bone key={w} w={w} h={34} />)
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((t) => t.id)} strategy={rectSortingStrategy}>
              {list.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </SortableContext>
          </DndContext>
        )}
        <AddTag count={list.length} />
      </div>
    </SettingsSection>
  )
}

function TagChip({ tag: t }: { tag: Tag }) {
  const refresh = useCatalogRefresh()
  const qc = useQueryClient()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id })
  const [name, setName] = useState(t.name)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(chipClass, "gap-0.5 pr-0 pl-1 text-ink-2", isDragging && "z-10 shadow-card-float")}
    >
      <Button variant="ghost" size="icon-xs" className="cursor-grab touch-none" aria-label={`Reorder ${t.name}`} {...attributes} {...listeners}>
        <IconGripVertical />
      </Button>
      <Popover>
        <PopoverTrigger render={<button type="button" className="h-full rounded-full pr-3.5 pl-1 hover:text-foreground" />}>{t.name}</PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!name.trim() || name.trim() === t.name) return
              try {
                await pbAdmin.collection("tags").update(t.id, { name: name.trim() })
                await refresh()
              } catch (err) {
                toast(errorMessage(err))
              }
            }}
          >
            <Input aria-label="Tag name" className="h-10" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={async () => {
                  try {
                    await pbAdmin.collection("tags").delete(t.id)
                    await refresh()
                    await qc.invalidateQueries({ queryKey: ["requests"] })
                  } catch (err) {
                    toast(errorMessage(err))
                  }
                }}
              >
                Delete
              </Button>
              <span className="flex-1" />
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function AddTag({ count }: { count: number }) {
  const refresh = useCatalogRefresh()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" className={cn(chipClass, "w-[34px] justify-center px-0 hover:bg-surface-3")} aria-label="Add a tag" />}>
        <IconPlus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            try {
              await pbAdmin.collection("tags").create({ name: name.trim(), order: count })
              await refresh()
              setName("")
              setOpen(false)
            } catch (err) {
              toast(errorMessage(err))
            }
          }}
        >
          <Input aria-label="New tag" placeholder="ios" className="h-10" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" className="h-10">
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
