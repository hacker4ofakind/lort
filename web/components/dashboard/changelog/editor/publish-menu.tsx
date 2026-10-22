"use client"

import { useState } from "react"
import { IconArrowBackUp, IconArrowUp, IconCalendar, IconChevronDown } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ChangelogState, RequestItem } from "@/lib/api"
import { attachedToComplete, scheduleAt } from "@/lib/changelog"
import { OPEN_STATUSES } from "@/lib/status"
import { dateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** A day's name that starts with the number it shows ("22 October 2026, today"), so the name contains the label (WCAG 2.5.3). */
export function dayLabel(date: Date, m: { today?: boolean; selected?: boolean }): string {
  const base = `${date.getDate()} ${LONG_MONTHS[date.getMonth()]} ${date.getFullYear()}`
  return `${base}${m.today ? ", today" : ""}${m.selected ? ", selected" : ""}`
}
const pad = (n: number) => String(n).padStart(2, "0")

export interface PublishMenuProps {
  slug: string
  state: Exclude<ChangelogState, "published">
  publishAt: string | null
  attached: RequestItem[]
  completeAttached: boolean
  onCompleteChange: (v: boolean) => void
  /** An action is on its way, or publishing isn't possible right now (an unpublish is pending). */
  disabled: boolean
  onPublishNow: () => void
  onSchedule: (at: Date) => void
  onUnschedule: () => void
  now?: () => Date
}

/** The completion box's sentence: "the 2 attached requests", or "the attached request". */
export function completionLabel(n: number): string {
  return n === 1
    ? "Also mark the attached request as Completed when it goes live"
    : `Also mark the ${n} attached requests as Completed when it goes live`
}

/** The titles that will change, so nobody completes a hidden request by surprise. */
export function completionTitles(items: RequestItem[]): string {
  const open = items.filter((r) => (OPEN_STATUSES as string[]).includes(r.status)).map((r) => r.title)
  return open.length > 3 ? `${open.slice(0, 3).join(", ")} and ${open.length - 3} more` : open.join(", ")
}

/**
 * Publish: a primary button with a popover of plain buttons and form controls (a dialog, not a
 * menu, since it holds a calendar, a time field and a checkbox). It names the address first,
 * because the address is fixed from then on.
 */
export function PublishMenu(p: PublishMenuProps) {
  const now = p.now ?? (() => new Date())
  const [open, setOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const start = () => {
    if (p.publishAt) {
      const d = new Date(p.publishAt)
      return { day: d, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
    }
    const t = now()
    return { day: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1), time: "09:00" }
  }
  const [day, setDay] = useState<Date>(() => start().day)
  const [time, setTime] = useState(() => start().time)

  const at = scheduleAt(day, time)
  const timeProblem = !at ? "Pick a time." : at.getTime() <= now().getTime() ? "Pick a time in the future." : ""
  const completable = attachedToComplete(p.attached)
  const today = new Date(now().getFullYear(), now().getMonth(), now().getDate())
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const row = "flex w-full items-start gap-3 rounded-[12px] p-2.5 text-left hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          const s = start()
          setDay(s.day)
          setTime(s.time)
          setScheduling(false)
        }
      }}
    >
      <PopoverTrigger render={<Button disabled={p.disabled} />}>
        {p.state === "scheduled" && p.publishAt ? `Scheduled · ${dateTime(p.publishAt)}` : "Publish"}
        <IconChevronDown className="size-[15px]" />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Publish" className="w-[min(340px,calc(100vw-24px))] p-2">
        <p className="px-2.5 pt-1.5 pb-2 text-caption text-muted-foreground">
          Goes live at <span className="font-semibold text-foreground">/changelog/{p.slug}</span>
        </p>
        <button
          type="button"
          className={row}
          disabled={p.disabled}
          onClick={() => {
            setOpen(false)
            p.onPublishNow()
          }}
        >
          <IconArrowUp className="mt-0.5 size-[18px] text-muted-foreground" aria-hidden />
          <span>
            <span className="block text-[14px] font-bold">Publish now</span>
            <span className="text-caption font-normal text-muted-foreground">Goes live on the changelog straight away.</span>
          </span>
        </button>
        <button
          type="button"
          className={cn(row, scheduling && "bg-surface-2")}
          aria-expanded={scheduling}
          onClick={() => setScheduling((s) => !s)}
        >
          <IconCalendar className="mt-0.5 size-[18px] text-muted-foreground" aria-hidden />
          <span>
            <span className="block text-[14px] font-bold">{p.state === "scheduled" ? "Change the time…" : "Schedule…"}</span>
            <span className="text-caption font-normal text-muted-foreground">Pick a day and time.</span>
          </span>
        </button>
        {scheduling && (
          <div className="px-1 pt-2 pb-1">
            <Calendar
              mode="single"
              required
              selected={day}
              onSelect={(d) => d && setDay(d)}
              defaultMonth={day}
              disabled={{ before: today }}
              weekStartsOn={1}
              labels={{ labelDayButton: dayLabel }}
              className="mx-auto bg-transparent p-0 [--cell-size:--spacing(9)]"
            />
            <div className="mt-3 flex items-center gap-2">
              <label className="flex h-[38px] flex-1 items-center gap-2 rounded-full border bg-background px-3.5 text-[14px]">
                <span className="text-muted-foreground">At</span>
                <Input
                  type="time"
                  aria-label="At"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-8 border-0 bg-transparent px-0 font-bold tabular-nums shadow-none"
                />
              </label>
              <Button
                size="sm"
                disabled={!!timeProblem || p.disabled}
                aria-describedby="schedule-problem"
                onClick={() => {
                  if (!at) return
                  setOpen(false)
                  p.onSchedule(at)
                }}
              >
                Schedule for {day.getDate()} {MONTHS[day.getMonth()]}
              </Button>
            </div>
            <p className="mt-2 px-1 text-caption text-muted-foreground">Times are in your time zone ({zone}).</p>
            {timeProblem && (
              <p id="schedule-problem" className="mt-1 px-1 text-caption text-danger">
                {timeProblem}
              </p>
            )}
          </div>
        )}
        {p.state === "scheduled" && (
          <button
            type="button"
            className={row}
            disabled={p.disabled}
            onClick={() => {
              setOpen(false)
              p.onUnschedule()
            }}
          >
            <IconArrowBackUp className="mt-0.5 size-[18px] text-muted-foreground" aria-hidden />
            <span>
              <span className="block text-[14px] font-bold">Unschedule</span>
              <span className="text-caption font-normal text-muted-foreground">Back to drafts. Nothing goes out.</span>
            </span>
          </button>
        )}
        {completable > 0 && (
          <div className="mt-1.5 border-t px-2.5 pt-3 pb-1.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-caption font-normal text-ink-2">
              <Checkbox
                checked={p.completeAttached}
                onCheckedChange={(v) => p.onCompleteChange(!!v)}
                className="mt-0.5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus"
              />
              <span>{completionLabel(completable)}</span>
            </label>
            <p className="mt-1 pl-[26px] text-caption text-muted-foreground">{completionTitles(p.attached)}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
