import { Bone } from "@/components/lort/bone"
import { StatusLabel } from "@/components/lort/status-icon"
import { ROADMAP_COLUMNS } from "@/lib/roadmap"

// Card-title widths per column: 4, 2 and 3 cards (design/canvas/S-Roadmap).
const CARDS = [
  ["78%", "62%", "84%", "55%"],
  ["70%", "88%"],
  ["66%", "74%", "58%"],
]

/** The board while the roadmap loads: the status labels are real, the cards are bones. */
export function RoadmapSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the roadmap" className="grid gap-4 md:grid-cols-3 md:items-start">
      {ROADMAP_COLUMNS.map((col, i) => (
        <section
          key={col.status}
          aria-label={col.label}
          className="flex flex-col gap-2.5 rounded-xl bg-ground-sunken p-3.5 [--si-ground:var(--ground-sunken)] md:min-h-[560px]"
        >
          <div className="flex items-center gap-2 px-0.5 pt-0.5 pb-1.5">
            <StatusLabel status={col.status} size={20} keyline className="font-display text-title" />
            <Bone w={26} h={20} />
          </div>
          {CARDS[i].map((w, j) => (
            <div key={j} className="flex gap-3 rounded-lg border bg-card p-3.5">
              <Bone w={40} h={40} />
              <div className="flex flex-1 flex-col gap-2.5 pt-1">
                <Bone w={w} h={15} />
                <div className="flex gap-1.5">
                  <Bone w={62} h={18} />
                  <Bone w={44} h={18} />
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
