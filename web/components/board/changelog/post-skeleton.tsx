import { Bone } from "@/components/lort/bone"

/** A post while it loads: bones for the date, title, cover and paragraphs. */
export function PostSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the post">
      <div className="mb-3.5 flex gap-2.5">
        <Bone w={120} h={18} />
        <Bone w={48} h={20} />
      </div>
      <Bone w="86%" h={38} className="rounded-[12px]" />
      <Bone w="52%" h={38} className="mt-2.5 rounded-[12px]" />
      <Bone w="100%" h={260} className="mt-7 mb-[30px] rounded-[18px]" />
      <div className="flex max-w-[68ch] flex-col gap-3">
        {["100%", "94%", "88%", "62%", "97%", "74%"].map((w, i) => (
          <Bone key={i} w={w} h={16} />
        ))}
      </div>
    </div>
  )
}
