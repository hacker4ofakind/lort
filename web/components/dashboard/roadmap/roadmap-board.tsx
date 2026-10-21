"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { useQuery } from "@tanstack/react-query"
import { useReducedMotion } from "motion/react"
import { useConfig } from "@/app/providers"
import { SuggestDialog } from "@/components/board/suggest-dialog"
import { createKeyboardNavigation, KEYBOARD_CODES, SCREEN_READER_INSTRUCTIONS } from "@/components/dashboard/roadmap/keyboard"
import { CardFace } from "@/components/dashboard/roadmap/roadmap-card"
import { RoadmapColumn } from "@/components/dashboard/roadmap/roadmap-column"
import { RoadmapSkeleton } from "@/components/dashboard/roadmap/roadmap-skeleton"
import { useCollapsedColumns } from "@/components/dashboard/roadmap/use-collapsed-columns"
import { columnOfCard, useRoadmapMove } from "@/components/dashboard/roadmap/use-roadmap-move"
import { useBoards } from "@/components/dashboard/use-boards"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { roadmap } from "@/lib/api"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useLiveRefresh } from "@/lib/realtime"
import { ROADMAP_COLUMNS, ROADMAP_ORDER } from "@/lib/roadmap"

/** /dashboard/roadmap: three columns of requests; drag a card (or use the keyboard, or the phone menu) to change its status. */
export function RoadmapBoard() {
  const config = useConfig()
  const router = useRouter()
  const hintId = useId()
  const reducedMotion = useReducedMotion()
  const boards = useBoards()
  const query = useQuery({ queryKey: keys.roadmap("team"), queryFn: () => roadmap(pbAdmin) })
  useLiveRefresh(pbAdmin, "requests", [keys.roadmap("team")])
  const mv = useRoadmapMove(query.data)
  const { collapsed, toggle } = useCollapsedColumns()
  const [adding, setAdding] = useState<{ open: boolean; status: "planned" | "progress" }>({ open: false, status: "planned" })

  const [kb] = useState(createKeyboardNavigation)
  const sensors = useSensors(
    // A few pixels of travel first, so a plain click still opens the request.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short press first, so a swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES, coordinateGetter: kb.coordinateGetter })
  )

  const cols = ROADMAP_ORDER.map((s) => (collapsed.includes(s) ? "64px" : "minmax(0,1fr)")).join(" ")
  const activeItem =
    mv.view && mv.activeId
      ? (() => {
          const at = columnOfCard(mv.view, mv.activeId)
          return at ? mv.view[at].find((i) => i.id === mv.activeId) : undefined
        })()
      : undefined

  return (
    <main className="px-4 pt-6 pb-10 sm:px-9 sm:pt-7">
      <div className="mb-[22px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-[30px] font-extrabold tracking-[-0.025em]">Roadmap</h1>
        <p className="text-[14px] text-muted-foreground">
          Drag a card to change its status.{" "}
          {config.roadmapPublic ? (
            "Planned and later show on the public roadmap."
          ) : (
            <>
              The public roadmap is off.{" "}
              <Link href="/dashboard/settings#roadmap" className="underline underline-offset-4 hover:text-foreground">
                Turn it on in Settings.
              </Link>
            </>
          )}
        </p>
      </div>

      {query.isPending ? (
        <RoadmapSkeleton />
      ) : query.isError || !mv.view ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The roadmap didn&apos;t load.</EmptyTitle>
          </EmptyHeader>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : (
        <DndContext
          id="roadmap"
          sensors={sensors}
          collisionDetection={kb.collisionDetection}
          accessibility={{ announcements: kb.announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
          onDragStart={(e) => {
            kb.reset()
            mv.onDragStart(e)
          }}
          onDragEnd={(e) => {
            kb.reset()
            mv.onDragEnd(e)
          }}
          onDragCancel={() => {
            kb.reset()
            mv.onDragCancel()
          }}
        >
          <p id={hintId} className="sr-only">
            Press Space to move it, Enter to open it.
          </p>
          <div style={{ "--cols": cols } as React.CSSProperties} className="grid gap-4 md:grid-cols-(--cols) md:items-start">
            {ROADMAP_COLUMNS.map((col) => (
              <RoadmapColumn
                key={col.status}
                col={col}
                items={mv.view![col.status]}
                collapsed={collapsed.includes(col.status)}
                busy={mv.busy}
                fresh={mv.fresh}
                hintId={hintId}
                onToggle={() => toggle(col.status)}
                onAdd={
                  col.status === "completed"
                    ? undefined
                    : () => setAdding({ open: true, status: col.status as "planned" | "progress" })
                }
                onOpen={(id) => router.push(`/dashboard/requests/${id}`)}
                onMove={(id, to) => mv.startMove(id, to)}
              />
            ))}
          </div>
          {/* A dropped card swaps places at once: the default drop animation would send it back to its old slot first. */}
          <DragOverlay dropAnimation={reducedMotion || mv.instantDrop ? null : undefined}>
            {activeItem ? <CardFace item={activeItem} floating /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <SuggestDialog
        open={adding.open}
        onOpenChange={(open) => setAdding((a) => ({ ...a, open }))}
        team
        boards={boards.data ?? []}
        roadmapStatus={adding.status}
        onCreated={(id) => mv.markFresh(id)}
      />
    </main>
  )
}
