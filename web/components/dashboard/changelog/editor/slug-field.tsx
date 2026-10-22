"use client"

import { forwardRef, useState } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cleanSlugInput, finalSlug } from "@/lib/changelog"
import { cn } from "@/lib/utils"

export const FIXED_HINT = "The address is fixed once a post has been published."

/**
 * The post's address after /changelog/. It cleans as you type and sends on blur, but only when
 * it was edited during this focus (tabbing through must not pin the address); "" hands it back
 * to the title. While it has focus the server's answers don't overwrite it.
 */
export const SlugField = forwardRef<
  HTMLInputElement,
  {
    slug: string
    fixed: boolean
    editable: boolean
    error?: string
    onCommit: (slug: string) => void
    className?: string
  }
>(function SlugField({ slug, fixed, editable, error, onCommit, className }, ref) {
  const [draft, setDraft] = useState<string | null>(null) // non-null while edited during this focus
  const value = draft ?? slug
  const errorId = "slug-error"
  const hintId = "slug-hint"
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <InputGroup className="h-9 rounded-full">
        <InputGroupAddon className="pr-0 text-caption text-muted-foreground">/changelog/</InputGroupAddon>
        <InputGroupInput
          ref={ref}
          aria-label="Post address"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : fixed ? hintId : undefined}
          readOnly={fixed || !editable}
          value={value}
          placeholder="add-a-title-first"
          spellCheck={false}
          className="min-w-0 pl-0.5 text-caption font-semibold"
          onChange={(e) => setDraft(cleanSlugInput(e.target.value))}
          onBlur={() => {
            if (draft !== null) {
              const next = finalSlug(draft)
              if (next !== slug) onCommit(next)
            }
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
        />
      </InputGroup>
      {error ? (
        <p id={errorId} className="px-3 text-caption text-danger">
          {error}
        </p>
      ) : (
        fixed && (
          <p id={hintId} className="px-3 text-caption text-muted-foreground">
            {FIXED_HINT}
          </p>
        )
      )}
    </div>
  )
})
