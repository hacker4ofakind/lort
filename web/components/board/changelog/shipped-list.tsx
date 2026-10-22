import Link from "next/link"
import { StatusLabel } from "@/components/lort/status-icon"
import { VoteSticker } from "@/components/lort/vote-sticker"
import type { RequestItem } from "@/lib/api"

/** "Shipped in this update": the requests a post lists, each a card linking to its page. */
export function ShippedList({ items }: { items: RequestItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="shipped-heading" className="mt-9 border-t pt-6">
      <h2 id="shipped-heading" className="mb-3 font-display text-[18px] leading-6 font-bold">
        Shipped in this update
      </h2>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="relative flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 [--si-ground:var(--surface)] hover:bg-surface-2 hover:[--si-ground:var(--surface-2)] has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-3 has-[a:focus-visible]:outline-focus"
          >
            <VoteSticker count={item.votes} voted={item.voted} size="sm" readOnly subject={item.title} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/feedback/${item.id}`}
                className="font-display text-[15px] leading-5 font-bold outline-none after:absolute after:inset-0 after:rounded-[inherit]"
              >
                {item.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                <StatusLabel status={item.status} size={14} />
                {/* On phones the author line moves under the title. */}
                {item.author.id && <span className="sm:hidden">Suggested by {item.author.name}</span>}
              </div>
            </div>
            {item.author.id && (
              <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">Suggested by {item.author.name}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
