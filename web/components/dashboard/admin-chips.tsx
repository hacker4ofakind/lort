"use client"

import { useQueryClient } from "@tanstack/react-query"
import { IconCheck, IconPlus, IconWorld } from "@tabler/icons-react"
import { toast } from "sonner"
import { useConfig } from "@/app/providers"
import { useBoards } from "@/components/dashboard/use-boards"
import { ChipButton, chipClass } from "@/components/lort/chip"
import { StatusIcon, StatusLabel } from "@/components/lort/status-icon"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { moveBoard, type RequestDetail } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { STATUS_META, statusMoves, type TriageActionId } from "@/lib/status"
import { cn } from "@/lib/utils"

export interface AdminChipsProps {
  request: RequestDetail
  /** Status moves go through the same handler as the triage bar. */
  onStatusAction: (action: TriageActionId) => void
}

/** The dashboard's editable chips: status, board, tags, add tag, and "On the board". */
export function AdminChips({ request: r, onStatusAction }: AdminChipsProps) {
  const qc = useQueryClient()
  const config = useConfig()
  const boards = useBoards()

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ["request"] }), qc.invalidateQueries({ queryKey: ["requests"] })])

  const update = async (data: Record<string, unknown>, done: string) => {
    try {
      await pbAdmin.collection("requests").update(r.id, data)
      await refresh()
      toast(done)
    } catch (err) {
      toast(errorMessage(err))
    }
  }

  const tagIds = r.tags.map((t) => t.id)
  const toggleTag = (id: string) =>
    update({ tags: tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id] }, "Updated the tags.")

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<ChipButton aria-label={`Status: ${STATUS_META[r.status].label}`} />}>
          <StatusLabel status={r.status} size={18} keyline />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52">
          {statusMoves(r.status).map((a) => (
            <DropdownMenuItem key={a.id} onClick={() => onStatusAction(a.id)}>
              <StatusIcon status={a.next!} decorative />
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<ChipButton aria-label={`Board: ${r.board.name}`} />}>{r.board.name}</DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52">
          <DropdownMenuRadioGroup
            value={r.board.id}
            onValueChange={async (id: string) => {
              try {
                await moveBoard(pbAdmin, r.id, id)
                await refresh()
                toast("Moved to another board.")
              } catch (err) {
                toast(errorMessage(err))
              }
            }}
          >
            {(boards.data ?? []).map((b) => (
              <DropdownMenuRadioItem key={b.id} value={b.id}>
                {b.isPublic ? b.name : `${b.name} (private)`}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {r.tags.map((t) => (
        <ChipButton key={t.id} className="text-ink-2" aria-label={`Remove tag ${t.name}`} onClick={() => toggleTag(t.id)}>
          {t.name}
        </ChipButton>
      ))}

      {config.tags.length > 0 && (
        <Popover>
          <PopoverTrigger render={<ChipButton className="w-[34px] justify-center px-0" aria-label="Add tag" />}>
            <IconPlus className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1.5">
            <Command>
              <CommandInput placeholder="Find a tag" />
              <CommandList>
                <CommandEmpty>No tag by that name.</CommandEmpty>
                <CommandGroup>
                  {config.tags.map((t) => (
                    <CommandItem key={t.id} value={t.name} onSelect={() => toggleTag(t.id)}>
                      {t.name}
                      <IconCheck className={cn("ml-auto size-4", !tagIds.includes(t.id) && "invisible")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <label className={cn(chipClass, "cursor-pointer gap-2 hover:bg-surface-3")}>
        <IconWorld className="size-4" aria-hidden />
        On the board
        <Switch
          checked={r.visible}
          onCheckedChange={(on) => update({ visible: on }, on ? "It's on the board now." : "Hidden from the board.")}
        />
      </label>
    </>
  )
}
