"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { IconArrowUp, IconLock, IconPhoto, IconWorld, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

export type Visibility = "public" | "internal"

export interface ComposerValue {
  text: string
  images: File[]
  visibility: Visibility
}

export interface ComposerProps {
  placeholder?: string
  /** Admins can switch to an internal note. */
  canUseInternal?: boolean
  /**
   * Called with the draft. While the promise is pending the draft is locked; it clears when the
   * promise resolves and stays, with the error's message, when it rejects.
   */
  onSubmit: (value: ComposerValue) => Promise<void>
  /** The Suggest modal's look: surface-2 with a strong border so it stands off the modal. */
  raised?: boolean
  /** Label for the field (screen readers); defaults to "Comment". */
  label?: string
  autoFocus?: boolean
  className?: string
}

export const MAX_IMAGES = 3
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Adds picked files to the current ones, applying the composer's limits. Pure, for tests. */
export function addImages(current: File[], picked: File[]): { images: File[]; error: string } {
  const images = picked.filter((f) => f.type.startsWith("image/"))
  let error = images.length < picked.length ? "Only images can be attached." : ""
  const tooBig = images.find((f) => f.size > MAX_IMAGE_BYTES)
  if (tooBig) error = `${tooBig.name} is over 5 MB. Try a smaller screenshot.`
  const ok = images.filter((f) => f.size <= MAX_IMAGE_BYTES)
  const room = MAX_IMAGES - current.length
  if (ok.length > room) error = `You can attach up to ${MAX_IMAGES} images.`
  return { images: [...current, ...ok.slice(0, Math.max(0, room))], error }
}

/** The prompt-box field for comments, notes and suggestion details. Voice dictation arrives in phase 5. */
export function Composer({
  placeholder = "Write a comment…",
  canUseInternal = false,
  onSubmit,
  raised = false,
  label = "Comment",
  autoFocus,
  className,
}: ComposerProps) {
  const [text, setText] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("public")
  const [images, setImages] = useState<File[]>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  const internal = visibility === "internal"

  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const submit = async () => {
    if (!text.trim() || pending) return
    setPending(true)
    setError("")
    try {
      await onSubmit({ text: text.trim(), images, visibility })
      setText("")
      setImages([])
    } catch (err) {
      setError(errorMessage(err, "That didn't send. Your text is still here, so try again."))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className={cn(
        "rounded-xl border bg-card px-4 pt-4 pb-2.5 transition-colors focus-within:border-border-strong",
        raised && "border-border-strong bg-surface-2 [--si-ground:var(--surface-2)]",
        internal && "border-2 border-dashed border-note-border bg-note-bg",
        className
      )}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        {internal ? "Internal note" : label}
      </label>
      {previews.length > 0 && (
        <div className="mb-2.5 flex gap-2">
          {previews.map((src, i) => (
            <span key={src} className="relative size-16 overflow-hidden rounded-sm bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={src} alt={images[i]?.name ?? ""} className="size-full object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-foreground text-background"
                aria-label={`Remove ${images[i]?.name ?? "image"}`}
                disabled={pending}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
              >
                <IconX className="size-3" stroke={3} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Textarea
        id={fieldId}
        value={text}
        rows={2}
        readOnly={pending}
        aria-busy={pending}
        autoFocus={autoFocus}
        placeholder={internal ? "Leave a note only the team can see…" : placeholder}
        onChange={(e) => !pending && setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
        className="max-h-60 min-h-[52px] rounded-none border-0 bg-transparent p-0 text-body focus-visible:outline-none dark:bg-transparent"
      />
      {error && (
        <p className="mt-1.5 text-caption text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const r = addImages(images, Array.from(e.target.files ?? []))
            setImages(r.images)
            setError(r.error)
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={`Attach images (up to ${MAX_IMAGES})`}
          disabled={pending || images.length >= MAX_IMAGES}
          onClick={() => fileRef.current?.click()}
        >
          <IconPhoto />
        </Button>
        {canUseInternal && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Visibility: ${internal ? "Internal" : "Public"}. Switch to ${internal ? "public" : "internal"}`}
            onClick={() => setVisibility(internal ? "public" : "internal")}
            className={cn(
              "text-ink-2",
              internal && "text-note-ink hover:bg-[color-mix(in_srgb,var(--note-border)_24%,transparent)] hover:text-note-ink"
            )}
          >
            {internal ? <IconLock /> : <IconWorld />}
            {internal ? "Internal" : "Public"}
          </Button>
        )}
        <span className="flex-1" />
        <Button
          type="submit"
          size="icon"
          className="size-10"
          aria-label="Send"
          aria-busy={pending}
          disabled={!text.trim() || pending}
        >
          <IconArrowUp stroke={2.4} />
        </Button>
      </div>
    </form>
  )
}
