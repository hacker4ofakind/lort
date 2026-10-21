import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/** What /roadmap and /roadmap/shipped show while the team keeps the roadmap private. */
export function RoadmapOff() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-3.5 sm:px-8 sm:pt-9">
      <Empty className="border py-14">
        <EmptyHeader>
          <EmptyTitle>No public roadmap yet</EmptyTitle>
          <EmptyDescription>The team hasn&apos;t shared its plans here. You can still suggest ideas and vote on the board.</EmptyDescription>
        </EmptyHeader>
        <Button render={<Link href="/feedback" />} variant="secondary">
          Go to the board
        </Button>
      </Empty>
    </main>
  )
}
