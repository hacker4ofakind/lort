import { Bone } from "@/components/lort/bone"
import { StatusLabel } from "@/components/lort/status-icon"
import { ROADMAP_COLUMNS } from "@/lib/roadmap"

// Card-title widths per column, so the bones read like real titles (design/canvas/S-Roadmap).
const CARDS = [
  ["78%", "62%", "84%", "55%"],
  ["70%", "88%"],
  ["66%", "74%", "58%"],
]

/** The three columns while the roadmap loads: the status labels render for real, everything else is bones. */
export function PublicRoadmapSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the roadmap" className="grid items-start gap-5 md:grid-cols-3">
      {ROADMAP_COLUMNS.map((col, i) => (
        <section
          key={col.status}
          aria-label={col.label}
          className="flex flex-col gap-2.5 rounded-xl bg-ground-sunken p-4 [--si-ground:var(--ground-sunken)]"
        >
          <div className="flex items-center gap-2.5 px-1 pt-0.5">
            <StatusLabel status={col.status} size={20} keyline className="font-display text-title" />
            <Bone w={26} h={20} />
          </div>
          <Bone w="55%" h={13} className="mx-1 mb-1.5" />
          {CARDS[i].map((w, j) => (
            <div key={j} className="flex gap-3 rounded-lg border bg-card px-4 py-3.5">
              <Bone w={40} h={40} />
              <div className="flex flex-1 flex-col gap-2.5 pt-1">
                <Bone w={w} h={15} />
                <div className="flex gap-1.5">
                  <Bone w={62} h={18} />
                  <Bone w={90} h={18} />
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
