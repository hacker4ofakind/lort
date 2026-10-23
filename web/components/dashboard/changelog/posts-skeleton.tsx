import { Bone } from "@/components/lort/bone"

const WIDTHS = ["58%", "44%", "71%", "52%", "63%", "39%"]

/** The posts table while it loads: the header row stays real, the rows are bones. */
export function PostsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading posts" className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center gap-4 px-2 text-[12px] font-bold text-muted-foreground">
        <span className="flex-1">Post</span>
        <span className="w-[190px] max-md:hidden">Labels</span>
        <span className="w-[210px] max-md:hidden">State</span>
        <span className="w-[100px] max-md:hidden">Requests</span>
        <span className="w-[58px] max-md:hidden" />
      </div>
      {WIDTHS.map((w, i) => (
        <div key={i} className="flex h-[60px] items-center gap-4 border-t px-2">
          <div className="flex-1">
            <Bone w={w} h={15} />
          </div>
          <div className="flex w-[190px] gap-1.5 max-md:hidden">
            <Bone w={44} h={20} />
            {i % 2 === 0 && <Bone w={64} h={20} />}
          </div>
          <div className="w-[210px] max-md:hidden">
            <Bone w={150} h={13} />
          </div>
          <div className="w-[100px] max-md:hidden">
            <Bone w={64} h={12} />
          </div>
          <div className="w-[58px] max-md:hidden">
            <Bone w={26} h={26} />
          </div>
        </div>
      ))}
    </div>
  )
}
