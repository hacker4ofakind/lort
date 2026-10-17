"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconGripVertical, IconPlus, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingsSection } from "@/components/dashboard/settings/section"
import { useCatalogRefresh } from "@/components/dashboard/settings/use-settings"
import { useBoards, type Board } from "@/components/dashboard/use-boards"
import { Bone } from "@/components/lort/bone"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { deleteBoard, setOrder } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { cn } from "@/lib/utils"

const GRID = "grid grid-cols-[32px_minmax(0,1fr)_88px_120px_36px] items-center gap-3"

/** Boards: drag to reorder (the top one is the default), Public and Needs approval switches, rename, add, delete. */
export function BoardsSection() {
  const qc = useQueryClient()
  const boards = useBoards()
  const refresh = useCatalogRefresh()
  const [newId, setNewId] = useState("")
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
  const list = boards.data ?? []

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = arrayMove(
      list,
      list.findIndex((b) => b.id === active.id),
      list.findIndex((b) => b.id === over.id)
    )
    qc.setQueryData(keys.boards, next) // show the new order straight away
    try {
      await setOrder(pbAdmin, "boards", next.map((b) => b.id))
    } catch (err) {
      toast(errorMessage(err))
    }
    await refresh()
  }

  const add = async () => {
    try {
      const b = await pbAdmin
        .collection("boards")
        .create<Board>({ name: "New board", order: list.length, isPublic: true, requireApproval: false })
      setNewId(b.id)
      await refresh()
    } catch (err) {
      toast(errorMessage(err))
    }
  }

  return (
    <SettingsSection
      id="boards"
      title="Boards"
      lede="Drag to reorder. The top board is the default for new suggestions. Private boards are only visible to your team."
    >
      <div className={cn(GRID, "pb-1.5 text-[12px] font-bold text-muted-foreground")}>
        <span />
        <span>Board</span>
        <span>Public</span>
        <span>Needs approval</span>
        <span />
      </div>
      {boards.isPending ? (
        [0, 1].map((i) => (
          <div key={i} className={cn(GRID, "border-t py-2.5")}>
            <Bone w={16} h={16} />
            <Bone w="40%" h={14} />
            <Bone w={30} h={18} />
            <Bone w={30} h={18} />
            <span />
          </div>
        ))
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {list.map((b, i) => (
              <BoardRow key={b.id} board={b} isDefault={i === 0} others={list.filter((o) => o.id !== b.id)} autoFocus={b.id === newId} />
            ))}
          </SortableContext>
        </DndContext>
      )}
      <div className="border-t pt-3">
        <Button variant="secondary" size="sm" onClick={add}>
          <IconPlus />
          Add board
        </Button>
      </div>
    </SettingsSection>
  )
}

function BoardRow({ board: b, isDefault, others, autoFocus }: { board: Board; isDefault: boolean; others: Board[]; autoFocus: boolean }) {
  const refresh = useCatalogRefresh()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id })
  const [name, setName] = useState(b.name)

  const update = async (data: Partial<Board>, done: string) => {
    try {
      await pbAdmin.collection("boards").update(b.id, data)
      await refresh()
      toast(done)
    } catch (err) {
      toast(errorMessage(err))
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(GRID, "relative border-t bg-card py-2.5", isDragging && "z-10 rounded-md shadow-card-float")}
    >
      <Button variant="ghost" size="icon-sm" className="cursor-grab touch-none" aria-label={`Reorder ${b.name}`} {...attributes} {...listeners}>
        <IconGripVertical />
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          aria-label={`Name of ${b.name}`}
          autoFocus={autoFocus}
          value={name}
          maxLength={60}
          className="h-9 border-transparent bg-transparent px-2.5 font-semibold hover:border-border focus-visible:border-border"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== b.name) void update({ name: name.trim() }, "Renamed the board.")
            else setName(b.name)
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {isDefault && <Badge variant="secondary">Default</Badge>}
      </div>
      <Switch
        aria-label={`${b.name} is public`}
        checked={b.isPublic}
        onCheckedChange={(on) => void update({ isPublic: on }, on ? `${b.name} is public now.` : `${b.name} is private now.`)}
      />
      <Switch
        aria-label={`${b.name} needs approval`}
        checked={b.requireApproval}
        onCheckedChange={(on) =>
          void update({ requireApproval: on }, on ? "New ideas there wait for your approval." : "New ideas there go straight on the board.")
        }
      />
      <DeleteBoard board={b} others={others} />
    </div>
  )
}

function DeleteBoard({ board: b, others }: { board: Board; others: Board[] }) {
  const refresh = useCatalogRefresh()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "")
  const [pending, setPending] = useState(false)
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${b.name}`} disabled={others.length === 0} onClick={() => setOpen(true)}>
        <IconX />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {b.name}?</AlertDialogTitle>
            <AlertDialogDescription>Any requests on it move to the board you pick, with a note on their timeline.</AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel>Move its requests to</FieldLabel>
            <Select value={moveTo} onValueChange={(v) => setMoveTo(String(v))} items={others.map((o) => ({ value: o.id, label: o.name }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                setPending(true)
                try {
                  await deleteBoard(pbAdmin, b.id, moveTo)
                  await refresh()
                  await qc.invalidateQueries({ queryKey: ["requests"] })
                  toast(`Deleted ${b.name}.`)
                  setOpen(false)
                } catch (err) {
                  toast(errorMessage(err))
                } finally {
                  setPending(false)
                }
              }}
            >
              Delete board
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
