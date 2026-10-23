"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { PostViewProps } from "@/components/board/changelog/post-view"
import type { ChangelogLabel, ChangelogState, EditorPost, RequestItem, SavedDraft } from "@/lib/api"
import { postFileUrl } from "@/lib/changelog"
import type { SiteConfig } from "@/lib/config"

/** What the person is writing. Seeded once; only a reseed replaces it. */
export interface PostContent {
  title: string
  body: string
  labels: ChangelogLabel[]
  cover: string
  attached: RequestItem[]
  completeAttached: boolean
}

/** What only the server decides; refetches and save answers keep it current. */
export interface PostServer {
  state: ChangelogState
  publishAt: string | null
  publishedAt: string | null
  publishError: string
  slug: string
  images: string[]
  revision: number
}

const content = (p: EditorPost): PostContent => ({
  title: p.title,
  body: p.body,
  labels: p.labels,
  cover: p.cover,
  attached: p.attached,
  completeAttached: p.completeAttached,
})

const server = (p: EditorPost): PostServer => ({
  state: p.state,
  publishAt: p.publishAt,
  publishedAt: p.publishedAt,
  publishError: p.publishError,
  slug: p.slug,
  images: p.images,
  revision: p.revision,
})

const sameContent = (a: PostContent, b: PostContent) =>
  a.title.trim() === b.title.trim() &&
  a.body.trim() === b.body.trim() &&
  a.cover === b.cover &&
  a.labels.join() === b.labels.join() &&
  a.attached.map((r) => r.id).join() === b.attached.map((r) => r.id).join()

/**
 * The editor's state. It seeds once from the server; later refetches (window focus) only move
 * the server's fields, so a refetch never replaces what is being typed. When a refetch shows the
 * post went live (the cron fired while it was open), the content is reseeded from the server and,
 * if it differed, a toast says the last change didn't make it. `version` rises on every reseed, so
 * the body editor knows to load the new text.
 */
export function useEditorForm(post: EditorPost | undefined) {
  const [seen, setSeen] = useState<EditorPost | undefined>(undefined)
  const [form, setForm] = useState<PostContent | null>(null)
  const [srv, setSrv] = useState<PostServer | null>(null)
  const [version, setVersion] = useState(0)
  const [lostEdit, setLostEdit] = useState(0)

  // Derived during render from the latest server copy, not in an effect.
  if (post && post !== seen) {
    setSeen(post)
    if (!form || !srv) {
      setForm(content(post))
      setSrv(server(post))
    } else {
      // Against the last server copy, not srv: a publish from this tab sets srv first, and the
      // refetch after it should still bring in the completed requests.
      const wentLive = post.state === "published" && seen?.state !== "published"
      setSrv({ ...srv, ...server(post), images: post.images })
      if (wentLive) {
        if (!sameContent(form, content(post))) setLostEdit((n) => n + 1)
        setForm(content(post))
        setVersion((v) => v + 1)
      }
    }
  }

  useEffect(() => {
    if (lostEdit > 0) toast("It went live before your last change saved.")
  }, [lostEdit])

  return {
    ready: !!form && !!srv,
    form: form as PostContent,
    server: srv as PostServer,
    version,
    /** Changes what is being written. */
    edit: (patch: Partial<PostContent>) => setForm((f) => (f ? { ...f, ...patch } : f)),
    /** Follows a save answer (address, images, cover) without touching what is being typed. */
    applySaved: (s: SavedDraft) =>
      setSrv((v) => (v ? { ...v, slug: s.slug, images: s.images, state: s.state, revision: s.revision } : v)),
    /** Follows a lifecycle answer (publish, schedule, unschedule, unpublish). */
    applyServer: (patch: Partial<PostServer>) => setSrv((v) => (v ? { ...v, ...patch } : v)),
    /** Starts over from the server's copy (Reload after a conflict, Undo of an unpublish). */
    reseed: (p: EditorPost) => {
      setSeen(p)
      setForm(content(p))
      setSrv(server(p))
      setVersion((v) => v + 1)
    },
  }
}

/** The post as the public would see it from what is being written, for Preview. */
export function previewData(id: string, form: PostContent, srv: PostServer, config: SiteConfig): PostViewProps {
  const publicBoards = new Set(config.boards.map((b) => b.id))
  return {
    title: form.title,
    labels: form.labels,
    date: srv.publishedAt ?? undefined,
    coverUrl: form.cover ? `${postFileUrl(id, form.cover)}?thumb=1600x0` : undefined,
    body: form.body,
    // What anyone could open: visible, on a public board (merged requests are closed and hidden).
    shipped: form.attached.filter((r) => r.visible && publicBoards.has(r.board.id)),
  }
}
