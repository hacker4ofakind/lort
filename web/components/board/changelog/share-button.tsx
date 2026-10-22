"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/** Copies a post's absolute address. */
export function ShareButton({ slug }: { slug: string }) {
  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/changelog/${slug}`)
      toast("Link copied.")
    } catch {
      toast("Couldn't copy the link.")
    }
  }
  return (
    <Button variant="secondary" onClick={share}>
      Share this update
    </Button>
  )
}
