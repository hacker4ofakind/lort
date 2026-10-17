import { Bone } from "@/components/lort/bone"

// Widths vary per card so the bones read like real titles and excerpts (design/canvas/S-Feedback).
const CARDS = [
  { t: "46%", b: "70%" },
  { t: "58%", b: "52%" },
  { t: "38%", b: "80%" },
  { t: "64%", b: "44%" },
  { t: "50%", b: "66%" },
]

/** The request list while it loads: card-shaped bones; the headline and floating bar render for real. */
export function FeedbackListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading ideas" className="flex flex-col gap-2.5 sm:gap-3">
      {CARDS.map((c, i) => (
        <div key={i} className="flex items-start gap-3.5 rounded-lg border bg-card p-4 sm:gap-[18px] sm:px-[22px] sm:py-5">
          <Bone w={58} h={58} className="max-sm:size-10" />
          <div className="flex flex-1 flex-col gap-2.5 pt-1">
            <Bone w={c.t} h={20} className="rounded-[8px]" />
            <Bone w="96%" h={13} />
            <Bone w={c.b} h={13} />
            <div className="mt-1.5 flex gap-2.5">
              <Bone w={92} h={20} />
              <Bone w={70} h={20} />
              <Bone w={84} h={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
