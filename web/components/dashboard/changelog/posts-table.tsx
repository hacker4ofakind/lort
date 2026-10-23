import Link from "next/link"
import { LabelChips } from "@/components/board/changelog/label-chips"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ChangelogState, TeamPost } from "@/lib/api"
import { stateText } from "@/lib/changelog"
import { cn } from "@/lib/utils"

/** Published = primary fill, scheduled = ink-2 fill, draft = a hollow ring. */
export function StateDot({ state }: { state: ChangelogState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "published" && "bg-primary",
        state === "scheduled" && "bg-ink-2",
        state === "draft" && "border-[1.5px] border-dot-empty"
      )}
    />
  )
}

function StateLine({ post, now }: { post: TeamPost; now?: Date }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption font-semibold">
      <StateDot state={post.state} />
      <span className={post.state === "draft" ? "text-muted-foreground" : "text-foreground"}>{stateText(post, now)}</span>
    </span>
  )
}

/** The dashboard's posts: title, labels, state, attached requests, author. Rows open the editor. */
export function PostsTable({ posts, now }: { posts: TeamPost[]; now?: Date }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Post</TableHead>
            <TableHead className="w-[190px] max-md:hidden">Labels</TableHead>
            <TableHead className="w-[210px] max-md:hidden">State</TableHead>
            <TableHead className="w-[100px] max-md:hidden">Requests</TableHead>
            <TableHead className="w-[58px] max-md:hidden">
              <span className="sr-only">Author</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((p) => (
            <TableRow key={p.id} className="relative h-[60px]">
              <TableCell className="max-w-0">
                <Link
                  href={`/dashboard/changelog/${p.id}`}
                  className={cn(
                    "block truncate font-display text-base font-bold outline-none after:absolute after:inset-0 focus-visible:after:outline-3 focus-visible:after:-outline-offset-3 focus-visible:after:outline-focus",
                    !p.title && "text-muted-foreground"
                  )}
                >
                  {p.title || "Untitled post"}
                </Link>
                {/* Phones: the state line moves under the title. */}
                <div className="mt-1 md:hidden">
                  <StateLine post={p} now={now} />
                </div>
              </TableCell>
              <TableCell className="max-md:hidden">
                <LabelChips labels={p.labels} />
              </TableCell>
              <TableCell className="max-md:hidden">
                <StateLine post={p} now={now} />
              </TableCell>
              <TableCell className="text-caption font-normal text-muted-foreground tabular-nums max-md:hidden">
                {p.requests > 0 ? `${p.requests} attached` : "None"}
              </TableCell>
              <TableCell className="max-md:hidden">
                {p.author.id && <PersonAvatar person={p.author} size={26} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
