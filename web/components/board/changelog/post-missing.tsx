import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/** A post address with no published post behind it (a draft, an unpublished post, a typo). */
export function PostMissing() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>This post isn&apos;t here</EmptyTitle>
        <EmptyDescription>It may be getting an edit. Everything else the team shipped is on the changelog.</EmptyDescription>
      </EmptyHeader>
      <Button variant="secondary" render={<Link href="/changelog" />}>
        See every update
      </Button>
    </Empty>
  )
}
