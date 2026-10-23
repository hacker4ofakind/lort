"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Editor as Tiptap } from "@tiptap/react"
import { IconArrowLeft, IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"
import { useConfig } from "@/app/providers"
import { PostView } from "@/components/board/changelog/post-view"
import { AttachedRequests } from "@/components/dashboard/changelog/editor/attached-requests"
import { BodyEditor } from "@/components/dashboard/changelog/editor/body-editor"
import { CoverField } from "@/components/dashboard/changelog/editor/cover-field"
import { EditorSkeleton } from "@/components/dashboard/changelog/editor/editor-skeleton"
import { LabelsField } from "@/components/dashboard/changelog/editor/labels-field"
import { PostActions } from "@/components/dashboard/changelog/editor/post-actions"
import { PublishMenu } from "@/components/dashboard/changelog/editor/publish-menu"
import { SlugField } from "@/components/dashboard/changelog/editor/slug-field"
import { CONFLICT, SIGNED_OUT, useAutosave, type Autosave } from "@/components/dashboard/changelog/editor/use-autosave"
import { useDelayedUnpublish } from "@/components/dashboard/changelog/editor/use-delayed-unpublish"
import { previewData, useEditorForm, type PostContent } from "@/components/dashboard/changelog/editor/use-editor-form"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  deletePost,
  editorPost,
  publishPost,
  schedulePost,
  unschedulePost,
  type EditorPost,
  type TeamPost,
} from "@/lib/api"
import { errorMessage, isNotFound } from "@/lib/errors"
import { mayLeave, setLeaveGuard } from "@/lib/leave-guard"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"
import { dateTime } from "@/lib/time"

const NOT_SAVED = "Your last changes haven't saved yet."

/** The back link, which waits for unsaved work like every dashboard link. */
function BackLink() {
  const router = useRouter()
  return (
    <Link
      href="/dashboard/changelog"
      onClick={async (e) => {
        e.preventDefault()
        if (await mayLeave()) router.push("/dashboard/changelog")
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-label text-muted-foreground hover:text-foreground"
    >
      <IconArrowLeft className="size-4" aria-hidden />
      Changelog
    </Link>
  )
}

/** /dashboard/changelog/<id>. */
export function EditorPage({ id }: { id: string }) {
  const q = useQuery({
    queryKey: keys.editorPost(id),
    queryFn: () => editorPost(pbAdmin, id),
    refetchOnWindowFocus: true,
    retry: (count, err) => !isNotFound(err) && count < 1,
  })
  if (q.isPending) return <EditorSkeleton bar={<BackLink />} />
  if (q.isError || !q.data) {
    const gone = isNotFound(q.error)
    return (
      <main className="px-4 pt-6 sm:px-10">
        <BackLink />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{gone ? "That post isn't here" : "The post didn't load."}</EmptyTitle>
            {gone && <EmptyDescription>It may have been deleted.</EmptyDescription>}
          </EmptyHeader>
          {!gone && (
            <Button variant="secondary" onClick={() => q.refetch()}>
              Try again
            </Button>
          )}
        </Empty>
      </main>
    )
  }
  return <Editor post={q.data} />
}

const toServer = (tp: TeamPost) => ({
  state: tp.state,
  publishAt: tp.publishAt,
  publishedAt: tp.publishedAt,
  publishError: tp.publishError,
  slug: tp.slug,
  revision: tp.revision,
})

/** True for a draft nobody has touched: what "New post" and an immediate Back leave behind. */
function untouched(form: PostContent, server: { state: string; publishAt: string | null; publishedAt: string | null; publishError: string; images: string[] }) {
  return (
    server.state === "draft" &&
    !server.publishAt &&
    !server.publishedAt &&
    !server.publishError &&
    server.images.length === 0 &&
    !form.title.trim() &&
    !form.body.trim() &&
    !form.cover &&
    form.labels.length === 0 &&
    form.attached.length === 0
  )
}

function SaveState({ autosave }: { autosave: Autosave }) {
  const { status, uploading, message } = autosave
  let text: React.ReactNode = null
  if (uploading) text = "Uploading image…"
  else if (status === "saving") text = "Saving…"
  else if (status === "saved")
    text = (
      <>
        <IconCheck className="size-3.5" stroke={2.6} aria-hidden />
        Saved
      </>
    )
  else if (status === "error") text = message
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-caption font-normal text-muted-foreground">{text}</span>
      {/* Only errors, signing out and the first Saved after an error are announced. */}
      <span role="status" aria-live="polite" className="sr-only">
        {autosave.announce}
      </span>
    </>
  )
}

function Editor({ post }: { post: EditorPost }) {
  const id = post.id
  const qc = useQueryClient()
  const router = useRouter()
  const config = useConfig()
  const f = useEditorForm(post)
  const body = useRef<Tiptap | null>(null)
  // The address field is drawn twice (top bar, and its own row on phones); focus the visible one.
  const slugDesktop = useRef<HTMLInputElement>(null)
  const slugPhone = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [committedSlug, setCommittedSlug] = useState("")
  const deleted = useRef(false)
  const everScheduled = useRef(post.state !== "draft")

  const autosave = useAutosave(
    id,
    { revision: post.revision, images: post.images },
    {
      onSaved: (s) => f.applySaved(s),
      onLive: () => void qc.invalidateQueries({ queryKey: keys.editorPost(id) }),
      getMarkdown: () => body.current?.getMarkdown() ?? "",
    }
  )

  const reload = async () => {
    const fresh = await qc.fetchQuery({ queryKey: keys.editorPost(id), queryFn: () => editorPost(pbAdmin, id), staleTime: 0 })
    f.reseed(fresh)
    autosave.reset(fresh.revision, fresh.images)
  }

  // Completing requests on publish changes what the request views cache: lists, the roadmap,
  // details, queues and the counts. router.refresh() keeps the QueryClient, so they'd stay stale.
  const refreshRequests = () =>
    Promise.all(
      [["requests"], ["request"], ["queue"], keys.stats].map((queryKey) => qc.invalidateQueries({ queryKey }))
    )

  const afterAction = () => {
    void qc.invalidateQueries({ queryKey: ["changelogs"] })
    void qc.invalidateQueries({ queryKey: ["changelog"] })
    router.refresh() // the nav's Changelog pill follows published posts
  }

  const unpub = useDelayedUnpublish({ id, title: f.form?.title ?? "" }, autosave, {
    onDone: (tp) => {
      if (tp) {
        f.applyServer(toServer(tp))
        autosave.setRevision(tp.revision)
      } else void reload()
      afterAction()
    },
    onRestore: () => void reload(),
  })

  // Leaving by a dashboard link waits for the save queue; an unpublish in its window goes now.
  const pendingUnpublish = useRef(false)
  useEffect(() => {
    pendingUnpublish.current = unpub.pending
  })
  useEffect(
    () =>
      setLeaveGuard(async () => {
        if (pendingUnpublish.current || (await autosave.flush())) return true
        return window.confirm(`${NOT_SAVED} Leave anyway?`)
      }),
    // autosave's methods close over one queue for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // A draft opened and left untouched cleans itself up, quietly, even as the tab closes.
  // The delete says which revision this window saw, and the server refuses it if the post has
  // moved on (another window saved into it), so a stale untouched window can't remove that work.
  const latest = useRef({ form: f.form, server: f.server, revision: autosave.revision })
  useEffect(() => {
    latest.current = { form: f.form, server: f.server, revision: autosave.revision }
    if (f.server?.state === "scheduled") everScheduled.current = true
  })
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    // StrictMode runs this effect's cleanup and setup back to back while the editor stays mounted;
    // a real departure doesn't set up again, so the clean-up waits a tick to tell them apart.
    clearTimeout(leaving.current)
    const cleanUp = () => {
      const { form, server, revision } = latest.current
      if (deleted.current || everScheduled.current || !form || !server || !untouched(form, server)) return
      deleted.current = true
      void fetch(`/api/collections/changelogs/records/${id}?ifUntouched=${revision}`, {
        method: "DELETE",
        keepalive: true,
        headers: { Authorization: pbAdmin.authStore.token },
      })
        .then(() => qc.invalidateQueries({ queryKey: ["changelogs"] }))
        .catch(() => undefined)
    }
    window.addEventListener("pagehide", cleanUp)
    return () => {
      window.removeEventListener("pagehide", cleanUp)
      leaving.current = setTimeout(cleanUp, 0)
    }
  }, [id, qc])

  if (!f.ready) return <EditorSkeleton bar={<BackLink />} />
  const { form, server } = f
  const live = server.state === "published" && !unpub.pending
  const editable = !live && !actionPending && autosave.status !== "conflict"
  const shownSlug = autosave.fieldError.slug ? committedSlug : server.slug

  const change = (patch: Partial<PostContent>) => f.edit(patch)

  const act = async (fn: () => Promise<void>) => {
    setActionPending(true)
    try {
      if (!(await autosave.flush())) {
        toast(NOT_SAVED)
        if (autosave.current().fieldError.slug)
          [slugDesktop.current, slugPhone.current].find((el) => el && el.offsetParent !== null)?.focus()
        return
      }
      await fn()
      afterAction()
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setActionPending(false)
    }
  }
  const applyTeam = (tp: TeamPost) => {
    f.applyServer(toServer(tp))
    autosave.setRevision(tp.revision)
  }

  const slug = (ref: React.Ref<HTMLInputElement>) => (
    <SlugField
      ref={ref}
      slug={shownSlug}
      fixed={!!server.publishedAt}
      editable={editable}
      error={autosave.fieldError.slug}
      onCommit={(v) => {
        setCommittedSlug(v)
        autosave.save({ slug: v }, { now: true })
      }}
    />
  )

  return (
    <div>
      <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-surface-2 px-4 py-3 sm:gap-x-3.5 sm:px-7 md:py-0">
        <BackLink />
        <SaveState autosave={autosave} />
        <span className="flex-1" />
        <div className="w-[min(360px,32vw)] max-md:hidden">{slug(slugDesktop)}</div>
        <Button variant="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? "Back to editing" : "Preview"}
        </Button>
        {live ? (
          <>
            <Button variant="ghost" className="max-sm:hidden" render={<Link href={`/changelog/${server.slug}`} />}>
              View post
            </Button>
            <Button variant="secondary" disabled={actionPending} onClick={() => unpub.unpublish()}>
              Unpublish
            </Button>
          </>
        ) : (
          <PublishMenu
            slug={server.slug || "…"}
            state={server.state === "scheduled" ? "scheduled" : "draft"}
            publishAt={server.publishAt}
            attached={form.attached}
            completeAttached={form.completeAttached}
            onCompleteChange={(v) => {
              change({ completeAttached: v })
              autosave.save({ completeAttached: v }, { now: true })
            }}
            disabled={actionPending || unpub.pending || autosave.status === "conflict"}
            onPublishNow={() =>
              void act(async () => {
                const res = await publishPost(pbAdmin, id)
                applyTeam(res.post)
                const n = res.completed
                if (n > 0) void refreshRequests()
                toast(
                  n > 0
                    ? `Published, and ${n === 1 ? "1 request" : `${n} requests`} marked as completed.`
                    : "Published. It's live on the changelog."
                )
              })
            }
            onSchedule={(at) =>
              void act(async () => {
                const tp = await schedulePost(pbAdmin, id, at)
                applyTeam(tp)
                toast(`Scheduled for ${dateTime(tp.publishAt ?? at.toISOString())}.`)
              })
            }
            onUnschedule={() =>
              void act(async () => {
                applyTeam(await unschedulePost(pbAdmin, id))
                toast("Back in drafts.")
              })
            }
          />
        )}
        {actionPending && <Spinner className="size-4 text-muted-foreground" aria-label="Working" />}
        <PostActions
          title={form.title}
          state={live ? "published" : server.state}
          onDelete={async () => {
            autosave.discard()
            deleted.current = true
            try {
              await deletePost(pbAdmin, id)
            } catch (err) {
              deleted.current = false
              toast(errorMessage(err))
              return
            }
            await qc.invalidateQueries({ queryKey: ["changelogs"] })
            toast("Post deleted.")
            router.push("/dashboard/changelog")
          }}
        />
      </div>
      {/* Phones: the address gets its own row. */}
      <div className="border-b border-surface-2 px-4 py-2.5 md:hidden">{slug(slugPhone)}</div>

      {autosave.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b bg-surface-2 px-4 py-3 sm:px-7">
          <span className="flex-1 text-label font-normal">{CONFLICT}</span>
          <Button size="sm" onClick={() => void reload()}>
            Reload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const text = `${form.title}\n\n${body.current?.getMarkdown() ?? form.body}`
              navigator.clipboard.writeText(text).then(
                () => toast("Copied your text."),
                () => toast("Couldn't copy your text.")
              )
            }}
          >
            Copy your text
          </Button>
        </div>
      )}
      {autosave.status === "signed-out" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b bg-surface-2 px-4 py-3 sm:px-7">
          <span className="flex-1 text-label font-normal">{SIGNED_OUT}</span>
          <Button size="sm" variant="secondary" render={<a href="/dashboard/login" target="_blank" rel="noopener" />}>
            Sign in
          </Button>
        </div>
      )}

      <main className="px-4 pt-10 pb-20 sm:px-8">
        {preview && (
          <div className="mx-auto max-w-[760px]">
            <PostView {...previewData(id, form, server, config)} />
          </div>
        )}
        <article hidden={preview} className="mx-auto max-w-[720px]">
          {live && (
            <p className="mb-5 rounded-lg bg-surface-2 px-4 py-3 text-label font-normal">This post is live. Unpublish it to make changes.</p>
          )}
          {server.state === "draft" && server.publishError && (
            <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-4 py-3">
              <p className="flex-1 text-label font-normal">
                This post didn&apos;t go out{server.publishAt ? ` at ${dateTime(server.publishAt)}` : ""}. It&apos;s back in drafts.{" "}
                {server.publishError}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  f.applyServer({ publishError: "" })
                  autosave.save({ publishError: "" }, { now: true })
                  void autosave.flush().then(() => qc.invalidateQueries({ queryKey: keys.failedPosts }))
                }}
              >
                Dismiss
              </Button>
            </div>
          )}
          <CoverField
            postId={id}
            cover={form.cover}
            editable={editable}
            onSet={async (file) => {
              const name = await autosave.setCover(file)
              change({ cover: name })
              return name
            }}
          />
          <div className="mt-[22px] mb-3.5">
            <LabelsField
              labels={form.labels}
              editable={editable}
              onChange={(labels) => {
                change({ labels })
                autosave.save({ labels }, { now: true })
              }}
            />
          </div>
          <Textarea
            aria-label="Title"
            placeholder="Give it a title"
            maxLength={160}
            rows={1}
            readOnly={!editable}
            value={form.title}
            onChange={(e) => {
              const title = e.target.value.replace(/\r?\n/g, " ")
              change({ title })
              autosave.save({ title })
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault()
                // Focus the view now: Tiptap's focus() waits for a frame, and typing can't.
                body.current?.view.focus()
                body.current?.commands.focus("start")
              }
            }}
            className="mb-5 min-h-0 resize-none overflow-hidden rounded-none focus-visible:outline-none border-0 bg-transparent p-0 font-display text-display-l [field-sizing:content] shadow-none sm:text-[44px] sm:leading-[48px] dark:bg-transparent"
          />
          <BodyEditor
            postId={id}
            markdown={form.body}
            version={f.version}
            editable={editable}
            onReady={(e) => {
              body.current = e
            }}
            onChange={(md) => {
              change({ body: md })
              autosave.save({ body: md })
            }}
            upload={(file) => autosave.upload(file)}
          />
          <AttachedRequests
            items={form.attached}
            editable={editable}
            onChange={(attached) => {
              change({ attached })
              autosave.save({ requests: attached.map((r) => r.id) }, { now: true })
            }}
          />
        </article>
      </main>
    </div>
  )
}
