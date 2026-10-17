"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useConfig } from "@/app/providers"
import { AuthForm } from "@/components/board/auth-form"
import { useVote } from "@/components/board/use-vote"
import { Composer, type ComposerValue } from "@/components/lort/composer"
import { Segmented } from "@/components/lort/segmented"
import { StatusLabel } from "@/components/lort/status-icon"
import { VoteSticker } from "@/components/lort/vote-sticker"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import { reassign, similar } from "@/lib/api"
import { useUser } from "@/lib/auth"
import type { Ref } from "@/lib/config"
import { pb, pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { useDebounced } from "@/lib/use-debounced"

export interface NewRequest {
  board: string
  title: string
  body: string
  tags: string[]
  images: File[]
  internal: boolean
  website: string
}

/**
 * The record-API payload for a new request. Pass it to create() as a plain object: the SDK
 * puts the files in the multipart body and everything else in "@jsonPayload", so booleans stay
 * booleans. Never build a FormData by hand. Pure, for tests.
 */
export function newRequestPayload(v: NewRequest) {
  return {
    board: v.board,
    title: v.title.trim(),
    body: v.body,
    tags: v.tags,
    images: v.images,
    internal: v.internal,
    website: v.website,
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SuggestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The dashboard's "New request": every board (private ones too) and "On behalf of". */
  team?: boolean
  /** Boards to offer; the first is the default. */
  boards: Ref[]
}

/** "Suggest something": board, title with similar requests, tags and details. Signed-out visitors sign in here first. */
export function SuggestDialog({ open, onOpenChange, team = false, boards }: SuggestDialogProps) {
  const user = useUser()
  const config = useConfig()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[72px] max-h-[calc(100dvh-96px)] translate-y-0 overflow-y-auto px-[26px] pt-6 pb-5 sm:max-w-[640px]">
        {user || team ? (
          <SuggestForm team={team} boards={boards} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogTitle className="sr-only">Suggest something</DialogTitle>
            <AuthForm heading={`Sign in to suggest something for ${config.appName}`} onDone={() => {}} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SuggestForm({ team, boards, onDone }: { team: boolean; boards: Ref[]; onDone: () => void }) {
  const config = useConfig()
  const user = useUser()
  const router = useRouter()
  const qc = useQueryClient()
  const onVote = useVote()
  const [board, setBoard] = useState(boards[0]?.id ?? "")
  const [title, setTitle] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [onBehalf, setOnBehalf] = useState("")
  const [website, setWebsite] = useState("")

  const q = useDebounced(title.trim(), 300)
  const matches = useQuery({ queryKey: keys.similar(q), queryFn: () => similar(pb, q), enabled: q.length >= 3 })

  const submit = async ({ text, images, visibility }: ComposerValue) => {
    if (title.trim().length < 3) throw new Error("Give your idea a title of at least 3 characters.")
    if (!board) throw new Error("Pick a board for your idea.")
    if (team && onBehalf.trim() && !EMAIL.test(onBehalf.trim())) {
      throw new Error("Enter the email of the person you're posting for, like name@example.com.")
    }
    const rec = await pb
      .collection("requests")
      .create<{ id: string; awaitingApproval: boolean }>(
        newRequestPayload({ board, title, body: text, tags, images, internal: visibility === "internal", website })
      )
    if (team && onBehalf.trim()) await reassign(pbAdmin, rec.id, onBehalf.trim())
    await qc.invalidateQueries({ queryKey: ["requests"] })
    if (team) await qc.invalidateQueries({ queryKey: keys.stats })
    toast(rec.awaitingApproval ? "Thanks! The team will look at it before it goes on the board." : "Posted. Thanks for the idea!")
    onDone()
    router.push(team ? `/dashboard/requests/${rec.id}` : `/feedback/${rec.id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{team ? "New request" : "Suggest something"}</DialogTitle>
        <DialogDescription>{team ? "Add one yourself, or for someone who asked." : `Got an idea for ${config.appName}?`}</DialogDescription>
      </DialogHeader>

      {boards.length > 1 && (
        <Field>
          <FieldTitle>Board</FieldTitle>
          <Segmented
            aria-label="Board"
            options={boards.map((b) => ({ value: b.id, label: b.name }))}
            value={board}
            onValueChange={setBoard}
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="suggest-title">Title</FieldLabel>
        <Input
          id="suggest-title"
          value={title}
          maxLength={140}
          placeholder="Dark theme for writing at night"
          onChange={(e) => setTitle(e.target.value)}
          className="h-auto rounded-[14px] px-4 py-3 font-display text-lg font-bold"
        />
        {q.length >= 3 && (matches.data?.length ?? 0) > 0 && (
          <div className="mt-2.5 rounded-md bg-surface-2 px-3.5 py-3 [--si-ground:var(--surface-2)]">
            <p className="mb-2 text-caption font-semibold text-ink-2">Is it one of these? A dot counts the same as a new post.</p>
            <ul>
              {matches.data!.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <VoteSticker size="sm" count={s.votes} voted={s.voted} subject={s.title} onToggle={() => onVote(s.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{s.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                      <StatusLabel status={s.status} size={14} className="font-medium text-muted-foreground" />· {s.board.name}
                    </div>
                  </div>
                  <Link
                    href={`/feedback/${s.id}`}
                    onClick={onDone}
                    className="text-caption font-semibold text-primary-text hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Field>

      {config.tags.length > 0 && (
        <Field>
          <FieldTitle>
            Tags <span className="font-medium text-muted-foreground">(optional)</span>
          </FieldTitle>
          <div className="flex flex-wrap gap-2">
            {config.tags.map((t) => (
              <Toggle
                key={t.id}
                pressed={tags.includes(t.id)}
                onPressedChange={(on) => setTags(on ? [...tags, t.id] : tags.filter((x) => x !== t.id))}
              >
                {t.name}
              </Toggle>
            ))}
          </div>
        </Field>
      )}

      {team && (
        <Field>
          <FieldLabel htmlFor="suggest-for">
            On behalf of <span className="font-medium text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id="suggest-for"
            type="email"
            placeholder="name@example.com"
            value={onBehalf}
            onChange={(e) => setOnBehalf(e.target.value)}
          />
        </Field>
      )}

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] size-px opacity-0"
      />

      <Field>
        <FieldTitle>Details</FieldTitle>
        <Composer
          raised
          label="Details"
          placeholder="What would it help you do? Screenshots welcome."
          canUseInternal={!!user?.isAdmin}
          onSubmit={submit}
        />
      </Field>
    </div>
  )
}
