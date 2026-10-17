import { Bone } from "@/components/lort/bone"

/**
 * The request page while it loads (design/canvas/S-Request): title, author, body, chips and the
 * timeline as bones. The page passes the real composer, which doesn't depend on the data.
 */
export function RequestSkeleton({ composer }: { composer?: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading the request">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Bone w="92%" h={34} className="rounded-[12px]" />
          <Bone w="58%" h={34} className="mt-2.5 rounded-[12px]" />
          <div className="mt-4 flex items-center gap-2.5">
            <Bone w={32} h={32} />
            <Bone w={150} h={13} />
          </div>
        </div>
        <Bone w={58} h={58} />
      </div>
      <div className="mt-6 flex flex-col gap-2.5">
        <Bone w="96%" h={14} />
        <Bone w="90%" h={14} />
        <Bone w="54%" h={14} />
      </div>
      <div className="mt-[22px] flex items-center gap-2">
        <Bone w={108} h={32} />
        <Bone w={64} h={32} />
        <Bone w={76} h={32} />
        <Bone w={58} h={32} />
      </div>
      <div className="mt-7 mb-[22px] h-px bg-border" />
      {composer}
      <div className="mt-7 flex flex-col gap-[22px]">
        <div className="flex items-center gap-3 pl-1">
          <Bone w={20} h={20} />
          <Bone w={280} h={12} />
        </div>
        <div className="flex flex-col gap-2.5 rounded-md bg-card px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Bone w={26} h={26} className="bg-surface-3" />
            <Bone w={110} h={12} className="bg-surface-3" />
          </div>
          <Bone w="88%" h={13} className="ml-[34px] bg-surface-3" />
          <Bone w="46%" h={13} className="ml-[34px] bg-surface-3" />
        </div>
        <div className="flex flex-col gap-2.5 px-1">
          <div className="flex items-center gap-2">
            <Bone w={26} h={26} />
            <Bone w={96} h={12} />
          </div>
          <Bone w="62%" h={13} className="ml-[34px]" />
        </div>
      </div>
    </div>
  )
}
