import { Bone } from "@/components/lort/bone"

/** The editor while the post loads: the bar stays real, its fields and the page are bones. */
export function EditorSkeleton({ bar }: { bar: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading the post">
      <div className="flex h-16 items-center gap-3.5 border-b border-surface-2 px-4 sm:px-7">
        {bar}
        <span className="flex-1" />
        <Bone w={260} h={36} className="max-md:hidden" />
        <Bone w={84} h={42} />
      </div>
      <div className="mx-auto max-w-[720px] px-4 pt-10 sm:px-8">
        <Bone w="100%" h={150} className="rounded-lg" />
        <div className="mt-[22px] mb-3.5 flex gap-2">
          <Bone w={56} h={30} />
          <Bone w={80} h={30} />
          <Bone w={60} h={30} />
        </div>
        <Bone w="78%" h={44} className="rounded-[12px]" />
        <div className="mt-6 flex flex-col gap-3">
          {["100%", "92%", "85%", "60%"].map((w, i) => (
            <Bone key={i} w={w} h={16} />
          ))}
        </div>
      </div>
    </div>
  )
}
