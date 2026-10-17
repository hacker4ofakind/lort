// Filters live in the URL so a refresh or a shared link keeps them. Defaults are left out of
// the URL. A cleared status filter ("every status") is written as status=all, because no
// status parameter means the default: the open statuses.
import { isStatus, OPEN_STATUSES, type Status } from "@/lib/status"

type Params = URLSearchParams | { get(name: string): string | null }

export type BoardSort = "trending" | "newest"
export type TableSort = "newest" | "oldest" | "top" | "updated"
export type Visibility = "" | "public" | "hidden"

export interface BoardFilters {
  sort: BoardSort
  status: Status[] // empty means every status
  board: string[]
  q: string
}

export interface TableFilters {
  sort: TableSort
  status: Status[]
  board: string[]
  tag: string[]
  visibility: Visibility
  q: string
}

function list(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : []
}

function statuses(v: string | null): Status[] {
  if (v === null) return [...OPEN_STATUSES]
  if (v === "all") return []
  return list(v).filter(isStatus)
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

function writeStatus(p: URLSearchParams, s: Status[]) {
  if (s.length === 0) p.set("status", "all")
  else if (!sameSet(s, OPEN_STATUSES)) p.set("status", s.join(","))
}

export function parseBoardFilters(p: Params): BoardFilters {
  return {
    sort: p.get("sort") === "newest" ? "newest" : "trending",
    status: statuses(p.get("status")),
    board: list(p.get("board")),
    q: p.get("q") ?? "",
  }
}

export function boardSearch(f: BoardFilters): string {
  const p = new URLSearchParams()
  if (f.sort !== "trending") p.set("sort", f.sort)
  writeStatus(p, f.status)
  if (f.board.length) p.set("board", f.board.join(","))
  if (f.q) p.set("q", f.q)
  const s = p.toString()
  return s ? `?${s}` : ""
}

const TABLE_SORTS: TableSort[] = ["newest", "oldest", "top", "updated"]

export function parseTableFilters(p: Params): TableFilters {
  const sort = p.get("sort") as TableSort
  const vis = p.get("visibility")
  return {
    sort: TABLE_SORTS.includes(sort) ? sort : "newest",
    status: statuses(p.get("status")),
    board: list(p.get("board")),
    tag: list(p.get("tag")),
    visibility: vis === "public" || vis === "hidden" ? vis : "",
    q: p.get("q") ?? "",
  }
}

export function tableSearch(f: TableFilters): string {
  const p = new URLSearchParams()
  if (f.sort !== "newest") p.set("sort", f.sort)
  writeStatus(p, f.status)
  if (f.board.length) p.set("board", f.board.join(","))
  if (f.tag.length) p.set("tag", f.tag.join(","))
  if (f.visibility) p.set("visibility", f.visibility)
  if (f.q) p.set("q", f.q)
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** Query parameters for GET /api/lort/requests and /api/lort/queue. */
export function apiParams(f: BoardFilters | TableFilters): Record<string, string> {
  const out: Record<string, string> = { sort: f.sort }
  if (f.status.length) out.status = f.status.join(",")
  if (f.board.length) out.board = f.board.join(",")
  if ("tag" in f && f.tag.length) out.tag = f.tag.join(",")
  if ("visibility" in f && f.visibility) out.visibility = f.visibility
  if (f.q) out.q = f.q
  return out
}
