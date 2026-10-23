"use client"

import { useRef, useState } from "react"
import { IconPhoto } from "@tabler/icons-react"
import { toast } from "sonner"
import { IMAGE_TYPES, imageProblem } from "@/components/dashboard/changelog/editor/images"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { postFileUrl } from "@/lib/changelog"
import { cn } from "@/lib/utils"

/** The cover: a dropzone, or the image with Replace and Remove. */
export function CoverField({
  postId,
  cover,
  editable,
  onSet,
}: {
  postId: string
  cover: string
  editable: boolean
  /** Saves the cover (null removes it) and resolves to its file name. */
  onSet: (file: File | null) => Promise<string>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

  const set = async (file: File | null) => {
    if (file) {
      const problem = imageProblem(file)
      if (problem) {
        toast(problem)
        return
      }
    }
    setBusy(true)
    try {
      await onSet(file)
    } catch (err) {
      if (err instanceof Error && err.message !== "Discarded.") toast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept={IMAGE_TYPES.join(",")}
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void set(e.target.files?.[0] ?? null)
        e.target.value = ""
      }}
    />
  )

  if (cover) {
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- PocketBase file, sized by its thumb */}
        <img src={`${postFileUrl(postId, cover)}?thumb=1600x0`} alt="Cover image" className="h-auto w-full rounded-[18px] bg-surface-2" />
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy && <Spinner />}
              Replace cover
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void set(null)}>
              Remove cover
            </Button>
          </div>
        )}
        {picker}
      </div>
    )
  }
  if (!editable) return null
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void set(e.dataTransfer.files?.[0] ?? null)
        }}
        className={cn(
          "flex h-[150px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-dot-empty px-4 text-center text-label text-muted-foreground transition-colors hover:bg-surface",
          over && "bg-surface-2"
        )}
      >
        {busy ? <Spinner className="size-6" /> : <IconPhoto className="size-6" aria-hidden />}
        Add a cover image
      </button>
      {picker}
    </>
  )
}
