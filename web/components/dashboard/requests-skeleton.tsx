import { Bone } from "@/components/lort/bone"

const WIDTHS = ["52%", "68%", "41%", "59%", "74%", "47%", "63%", "55%", "38%", "70%", "49%", "61%"]

/** The requests table while it loads (design/canvas/S-Requests): the header row stays real, the rows are bones. */
export function RequestsTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading requests" className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center px-[18px] text-[12px] font-bold text-muted-foreground">
        <span className="w-[46px]" />
        <span className="flex-1">Request</span>
        <span className="w-[78px] text-right">Votes</span>
        <span className="w-[214px] pl-3.5 max-lg:hidden">Tags</span>
        <span className="w-[78px] pl-3.5 max-sm:hidden">Date</span>
        <span className="w-[62px]" />
      </div>
      {WIDTHS.map((w, i) => (
        <div key={i} className="flex h-14 items-center gap-3.5 border-t px-[18px]">
          <Bone w={18} h={18} />
          <div className="flex-1">
            <Bone w={w} h={14} />
          </div>
          <Bone w={34} h={14} />
          <div className="flex w-[200px] gap-1.5 max-lg:hidden">
            <Bone w={i % 3 === 0 ? 64 : 48} h={20} />
            {i % 2 === 1 && <Bone w={56} h={20} />}
          </div>
          <Bone w={44} h={12} className="max-sm:hidden" />
          <Bone w={26} h={26} />
        </div>
      ))}
    </div>
  )
}
