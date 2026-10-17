// Typed calls to Lort's /api/lort endpoints. Each takes the client to call with: pb for the
// board user (and an admin's linked profile), pbAdmin for team endpoints.
import type { Client } from "@/lib/pocketbase"
import type { Ref } from "@/lib/config"
import type { Status, TriageActionId } from "@/lib/status"

export type { Ref }

export interface Person {
  id: string // "" when the account was deleted
  name: string
  avatar: string // file name on the users record, "" for none
  team: boolean
}

export interface RequestItem {
  id: string
  title: string
  body: string
  status: Status
  board: Ref
  author: Person
  tags: Ref[]
  comments: number
  votes: number
  voted: boolean
  visible: boolean
  awaitingApproval: boolean
  new: boolean // team view only: not opened by the team yet
  created: string
}

export interface Page<T> {
  items: T[]
  page: number
  perPage: number
  totalItems: number
}

export interface Comment {
  id: string
  body: string
  images: string[]
  internal: boolean
  author: Person
  created: string
  replies: Comment[]
}

export type EventKind = "created" | "status_changed" | "merged_in" | "merged_from" | "board_changed"

export interface TimelineEvent {
  id: string
  kind: EventKind
  actor: Person
  from: string
  to: string
  ref: Ref | null
  created: string
}

export interface RequestDetail extends RequestItem {
  images: string[]
  public: boolean // on a public board and visible: its images load without a file token
  mergedInto: Ref | null
  thread: Comment[] // called thread because comments is the count
  activity: TimelineEvent[]
}

export interface StatusChange {
  from: Status
  to: Status
  roadmap: "added" | "removed" | ""
}

export interface QueueInfo {
  position: number
  total: number
  next: string
}

export interface Stats {
  total: number
  waiting: number
  new: number
}

export interface TeamMember {
  id: string
  email: string
  name: string
  created: string
}

export interface UserSummary {
  id: string
  name: string
  email: string
  joined: string
  requests: number
  votes: number
  verified: boolean
  banned: boolean
  team: boolean
}

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })

export const PAGE_SIZE = 20

export function listRequests(c: Client, params: Record<string, string>, page = 1): Promise<Page<RequestItem>> {
  return c.send("/api/lort/requests", { query: { ...params, page, perPage: PAGE_SIZE } })
}

export function getRequest(c: Client, id: string): Promise<RequestDetail> {
  return c.send(`/api/lort/requests/${id}`, {})
}

export async function similar(c: Client, q: string): Promise<RequestItem[]> {
  const res = await c.send<{ items: RequestItem[] }>("/api/lort/similar", { query: { q } })
  return res.items
}

export function vote(c: Client, id: string): Promise<{ voted: boolean; votes: number }> {
  return c.send(`/api/lort/requests/${id}/vote`, { method: "POST" })
}

export function setStatus(c: Client, id: string, action: TriageActionId): Promise<StatusChange> {
  return c.send(`/api/lort/requests/${id}/status`, json({ action }))
}

export function undoComplete(c: Client, id: string): Promise<StatusChange> {
  return c.send(`/api/lort/requests/${id}/undo`, { method: "POST" })
}

export function merge(c: Client, id: string, target: string): Promise<void> {
  return c.send(`/api/lort/requests/${id}/merge`, json({ target }))
}

export function markSeen(c: Client, id: string): Promise<void> {
  return c.send(`/api/lort/requests/${id}/seen`, { method: "POST" })
}

export function moveBoard(c: Client, id: string, board: string): Promise<void> {
  return c.send(`/api/lort/requests/${id}/board`, json({ board }))
}

export function reassign(c: Client, id: string, email: string): Promise<void> {
  return c.send(`/api/lort/requests/${id}/author`, json({ email }))
}

export function queue(c: Client, params: Record<string, string>, current: string): Promise<QueueInfo> {
  return c.send("/api/lort/queue", { query: { ...params, current } })
}

export function stats(c: Client): Promise<Stats> {
  return c.send("/api/lort/stats", {})
}

export async function teamList(c: Client): Promise<{ items: TeamMember[]; you: string }> {
  return c.send("/api/lort/team", {})
}

export function teamMe(c: Client): Promise<{ profile: Record<string, unknown>; token: string }> {
  return c.send("/api/lort/team/me", {})
}

export async function invite(c: Client, email: string): Promise<string> {
  const res = await c.send<{ link: string }>("/api/lort/team/invite", json({ email }))
  return res.link
}

export function removeAdmin(c: Client, id: string): Promise<void> {
  return c.send(`/api/lort/team/${id}`, { method: "DELETE" })
}

export function userSummary(c: Client, id: string): Promise<UserSummary> {
  return c.send(`/api/lort/users/${id}`, {})
}

export function setBanned(c: Client, id: string, banned: boolean): Promise<void> {
  return c.send(`/api/lort/users/${id}/ban`, json({ banned }))
}

export async function resetLink(c: Client, id: string): Promise<string> {
  const res = await c.send<{ link: string }>(`/api/lort/users/${id}/reset-link`, { method: "POST" })
  return res.link
}

export function setOrder(c: Client, collection: "boards" | "tags", ids: string[]): Promise<void> {
  return c.send(`/api/lort/order/${collection}`, json({ ids }))
}

export function deleteBoard(c: Client, id: string, moveTo = ""): Promise<void> {
  return c.send(`/api/lort/boards/${id}`, { method: "DELETE", query: moveTo ? { moveTo } : {} })
}
