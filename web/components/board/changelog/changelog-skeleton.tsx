import { Bone } from "@/components/lort/bone"

const TITLES = ["72%", "58%", "80%", "64%"]

/** The public list while it loads: entry bones under the real headline and filter. */
export function ChangelogSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the changelog">
      {TITLES.map((w, i) => (
        <div key={i} className="grid gap-x-7 gap-y-3 border-t py-7 md:grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 md:pt-1">
            <Bone w={56} h={14} />
            <Bone w={36} h={12} />
          </div>
          <div className="flex flex-col gap-3">
            <Bone w={48} h={20} />
            <Bone w={w} h={26} className="rounded-[12px]" />
            <Bone w="92%" h={14} />
            <Bone w="66%" h={14} />
          </div>
        </div>
      ))}
    </div>
  )
}
