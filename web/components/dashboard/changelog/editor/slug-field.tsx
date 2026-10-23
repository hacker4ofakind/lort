"use client"

import { forwardRef, useState } from "react"
import { IconHelpCircle } from "@tabler/icons-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* A disabled field takes no focus ring; the group's dimming is left to the input itself. */}
      <InputGroup className="h-9 rounded-full has-disabled:opacity-100">
        <InputGroupAddon className="pr-0 text-caption text-muted-foreground">/changelog/</InputGroupAddon>
        <InputGroupInput
          ref={ref}
          aria-label="Post address"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          disabled={fixed || !editable}
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
        {fixed && (
          <InputGroupAddon align="inline-end" className="pr-3.5 pl-4">
            <Tooltip>
              <TooltipTrigger
                render={<button type="button" aria-label={FIXED_HINT} className="inline-flex rounded-full hover:text-foreground" />}
              >
                <IconHelpCircle className="size-4" />
              </TooltipTrigger>
              <TooltipContent>{FIXED_HINT}</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        )}
      </InputGroup>
      {error && (
        <p id={errorId} className="px-3 text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  )
})
