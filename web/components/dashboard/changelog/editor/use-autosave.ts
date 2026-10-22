"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { ClientResponseError } from "pocketbase"
import { addImage, removeImages, updateDraft, type DraftPatch, type SavedDraft } from "@/lib/api"
import { referencedImages } from "@/lib/changelog"
import { errorMessage } from "@/lib/errors"
import { pbAdmin, type Client } from "@/lib/pocketbase"

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "signed-out" | "conflict"

export interface AutosaveState {
  status: SaveStatus
  /** Field errors from the server, shown under their field (only the address has one today). */
  fieldError: { slug?: string }
  /** A message for an error without a field. */
  message: string
  /** The last revision this tab saw: from the first load, its own saves and its own lifecycle calls. */
  revision: number
  /** An upload or cover change is on its way. */
  uploading: boolean
  /** What the polite live region says: errors, signing out, and the first Saved after an error. */
  announce: string
}

export interface AutosaveEvents {
  /** Every successful save, with the server-owned fields. */
  onSaved?: (saved: SavedDraft) => void
  /** The server says the post went live meanwhile. */
  onLive?: () => void
  /** The current body, so a full post can make room for a new image. */
  getMarkdown?: () => string
}

export const MAX_IMAGES = 30
const TEXT_FIELDS = new Set(["title", "body"])
const DEBOUNCE_MS = 1000
const RETRY_MS = [2000, 5000]
const RETRY_LATER_MS = 10_000

const LIVE = "This post is live. Unpublish it to make changes."
export const SIGNED_OUT = "You've been signed out. Sign in again to keep saving."
export const CONFLICT = "This post changed in another window. Reload to see it."
const RETRYING = "Couldn't save. Trying again…"

type Op =
  | { kind: "patch"; patch: DraftPatch }
  | { kind: "upload"; file: File; resolve: (name: string) => void; reject: (err: Error) => void }
  | { kind: "cover"; file: File | null; resolve: (name: string) => void; reject: (err: Error) => void }

const statusOf = (err: unknown) => (err instanceof ClientResponseError ? err.status : -1)

/**
 * A draft's save queue. It lives in a ref, not in React state, so it outlives the editor: on
 * unmount it sends what is pending instead of dropping it. Patches merge; title and body wait a
 * second after the last change, everything else goes at once. One request is in flight at a time,
 * in order, so an older save can never land after a newer one. Every request carries the revision
 * this tab last saw, so a save made from a stale copy is refused (409) instead of overwriting.
 */
export class SaveQueue {
  private pending: DraftPatch = {}
  private ops: Op[] = []
  private busy = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private paused = false
  private blocked = false // a 400 without field data: wait for the next change
  private failures = 0
  private hadError = false // the next Saved is announced
  private images: string[]
  private listeners = new Set<() => void>()
  private settled = new Set<() => void>()
  private unsubscribeAuth: (() => void) | undefined
  state: AutosaveState

  constructor(
    private client: Client,
    private id: string,
    initial: { revision: number; images: string[] },
    public events: AutosaveEvents = {}
  ) {
    this.images = initial.images
    this.state = { status: "idle", fieldError: {}, message: "", revision: initial.revision, uploading: false, announce: "" }
  }

  // ---- React binding

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.state

  private set(next: Partial<AutosaveState>) {
    const prev = this.state
    const status = next.status ?? prev.status
    let announce = prev.announce
    if (next.status && next.status !== prev.status) {
      if (status === "error") announce = next.message || RETRYING
      else if (status === "signed-out") announce = SIGNED_OUT
      else if (status === "conflict") announce = CONFLICT
      else if (status === "saved" && this.hadError) announce = "Saved"
      this.hadError = status === "error" || status === "signed-out" || (this.hadError && status !== "saved")
    }
    this.state = { ...prev, ...next, announce }
    this.listeners.forEach((l) => l())
  }

  // ---- What the editor calls

  save(patch: DraftPatch, o: { now?: boolean } = {}) {
    this.pending = { ...this.pending, ...patch }
    this.blocked = false
    if ("slug" in patch && this.state.fieldError.slug) this.set({ fieldError: { ...this.state.fieldError, slug: undefined } })
    const textOnly = Object.keys(patch).every((k) => TEXT_FIELDS.has(k))
    this.schedule(o.now || !textOnly ? 0 : DEBOUNCE_MS)
  }

  /** Uploads one body image as its own request and resolves to its file name. */
  upload(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ops.push({ kind: "upload", file, resolve, reject })
      this.set({ uploading: true })
      this.schedule(0)
    })
  }

  /** Sets (or, with null, removes) the cover; resolves to its file name ("" when removed). */
  setCover(file: File | null): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ops.push({ kind: "cover", file, resolve, reject })
      this.set({ uploading: true })
      this.schedule(0)
    })
  }

  /** Resolves true once everything pending has saved; false, never hanging, when it can't. */
  async flush(): Promise<boolean> {
    let retried = false
    for (;;) {
      const s = this.state
      if (this.paused || this.blocked || s.status === "signed-out" || s.status === "conflict" || s.fieldError.slug) return false
      if (!this.dirty()) return true
      if (s.status === "error") {
        if (retried) return false
        retried = true
      }
      clearTimeout(this.timer)
      const done = new Promise<void>((r) => this.settled.add(r))
      void this.run()
      await done
    }
  }

  /** Drops everything not yet sent (Undo of an unpublish, Delete, Reload). */
  discard() {
    clearTimeout(this.timer)
    this.pending = {}
    for (const op of this.ops) if (op.kind !== "patch") op.reject(new Error("Discarded."))
    this.ops = []
    this.blocked = false
    this.set({ uploading: false, fieldError: {} })
  }

  /** Holds saves (while an unpublish waits); resume() sends them. */
  pause() {
    this.paused = true
    clearTimeout(this.timer)
  }
  resume() {
    this.paused = false
    this.schedule(0)
  }

  /** Starts over from the server's copy: nothing pending, its revision, no error. */
  reset(revision: number, images: string[]) {
    this.discard()
    this.images = images
    this.set({ status: "idle", message: "", revision })
  }

  /** A lifecycle call (publish, schedule…) answered with this revision. */
  setRevision(revision: number) {
    this.set({ revision })
  }

  /** Sends what is pending now, without waiting for the debounce (the editor is going away). */
  sendNow() {
    clearTimeout(this.timer)
    void this.run()
  }

  /** Something isn't saved yet: pending, on its way, or stuck. */
  dirty(): boolean {
    return (
      this.busy ||
      this.ops.length > 0 ||
      Object.keys(this.pending).length > 0 ||
      this.state.status === "signed-out" ||
      this.state.status === "conflict"
    )
  }

  close() {
    this.unsubscribeAuth?.()
  }

  setEvents(events: AutosaveEvents) {
    this.events = events
  }

  // ---- The queue

  private schedule(ms: number) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), ms)
  }

  private notifySettled() {
    const waiting = [...this.settled]
    this.settled.clear()
    waiting.forEach((r) => r())
  }

  private async run(): Promise<void> {
    const s = this.state.status
    if (this.busy || this.paused || this.blocked || s === "signed-out" || s === "conflict") {
      if (!this.busy) this.notifySettled()
      return
    }
    let op = this.ops.shift()
    if (!op) {
      if (Object.keys(this.pending).length === 0) {
        this.notifySettled()
        return
      }
      op = { kind: "patch", patch: this.pending }
      this.pending = {}
    }
    this.busy = true
    this.set({ status: "saving" })
    try {
      const saved = await this.send(op)
      this.failures = 0
      this.images = saved.images
      this.busy = false
      this.set({ revision: saved.revision, message: "", status: this.dirty() ? "saving" : "saved", uploading: this.hasFileOps() })
      this.events.onSaved?.(saved)
      if (this.dirty()) void this.run()
      else this.notifySettled()
    } catch (err) {
      this.busy = false
      this.fail(op, err)
      this.notifySettled()
    }
  }

  private hasFileOps() {
    return this.ops.some((o) => o.kind !== "patch")
  }

  private async send(op: Op): Promise<SavedDraft> {
    const rev = this.state.revision
    if (op.kind === "patch") return updateDraft(this.client, this.id, op.patch, rev)
    if (op.kind === "cover") {
      const saved = await updateDraft(this.client, this.id, { cover: op.file }, rev)
      op.resolve(saved.cover)
      return saved
    }
    let before = this.images
    if (before.length >= MAX_IMAGES) {
      // Make room: drop the images the body no longer uses.
      const used = referencedImages(this.events.getMarkdown?.() ?? "", before)
      const unused = before.filter((n) => !used.has(n))
      if (unused.length === 0) {
        const err = new Error(`A post can hold ${MAX_IMAGES} images.`)
        op.reject(err)
        throw Object.assign(err, { handled: true })
      }
      const pruned = await removeImages(this.client, this.id, unused, rev)
      this.images = before = pruned.images
      this.set({ revision: pruned.revision })
    }
    const saved = await addImage(this.client, this.id, op.file, this.state.revision)
    const name = saved.images.find((n) => !before.includes(n))
    if (name) op.resolve(name)
    else op.reject(new Error("The image didn't upload."))
    return saved
  }

  /** Puts op back at the front of the queue, ahead of newer changes. */
  private requeue(op: Op) {
    if (op.kind === "patch") this.pending = { ...op.patch, ...this.pending }
    else this.ops.unshift(op)
  }

  private fail(op: Op, err: unknown) {
    if ((err as { handled?: boolean }).handled) {
      this.set({ status: this.dirty() ? "saving" : "saved", uploading: this.hasFileOps() })
      if (this.dirty()) this.schedule(0)
      return
    }
    const code = statusOf(err)
    if (code === 401 || code === 403) {
      this.requeue(op)
      this.set({ status: "signed-out" })
      this.waitForSignIn()
      return
    }
    if (code === 409) {
      this.requeue(op)
      this.set({ status: "conflict", message: CONFLICT })
      return
    }
    if (code === 400 || code === 404 || code === 413) {
      const e = err as ClientResponseError
      const fields = (e.response?.data ?? {}) as Record<string, { message?: string }>
      const names = Object.keys(fields)
      const message = errorMessage(err)
      if (op.kind !== "patch") {
        // A file the server won't take: tell the caller, keep going with the rest.
        op.reject(new Error(message))
        this.set({ status: this.dirty() ? "saving" : "error", message, uploading: this.hasFileOps() })
        if (this.dirty()) this.schedule(0)
        return
      }
      if (message === LIVE) {
        this.pending = {}
        this.set({ status: "idle", message: "" })
        this.events.onLive?.()
        return
      }
      if (names.length > 0) {
        const rest: DraftPatch = { ...op.patch }
        const fieldError = { ...this.state.fieldError }
        for (const n of names) {
          delete rest[n as keyof DraftPatch]
          if (n === "slug") fieldError.slug = fields[n]?.message ?? message
        }
        this.pending = { ...rest, ...this.pending }
        this.set({ fieldError, status: Object.keys(this.pending).length ? "saving" : "error", message })
        if (Object.keys(this.pending).length) this.schedule(0)
        return
      }
      this.requeue(op)
      this.blocked = true
      this.set({ status: "error", message })
      return
    }
    // The network or the server is having trouble: try again, more slowly each time.
    this.requeue(op)
    const wait = RETRY_MS[this.failures] ?? RETRY_LATER_MS
    this.failures++
    this.set({ status: "error", message: RETRYING })
    this.schedule(wait)
  }

  private waitForSignIn() {
    this.unsubscribeAuth?.()
    this.unsubscribeAuth = this.client.authStore.onChange(() => {
      if (!this.client.authStore.isValid || this.state.status !== "signed-out") return
      this.unsubscribeAuth?.()
      this.unsubscribeAuth = undefined
      this.set({ status: "saving" })
      this.schedule(0)
    })
  }
}

/**
 * The editor's autosave (see SaveQueue). The queue outlives the component: unmounting sends
 * anything pending at once. While anything is unsaved, leaving the page asks first.
 */
export function useAutosave(id: string, initial: { revision: number; images: string[] }, events: AutosaveEvents = {}) {
  const [queue] = useState(() => new SaveQueue(pbAdmin, id, initial, events))
  useEffect(() => {
    queue.setEvents(events)
  })
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (queue.dirty()) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      // Leaving the editor: whatever is pending goes now, not when the debounce would have fired.
      queue.sendNow()
    }
  }, [queue])

  return {
    ...state,
    save: (patch: DraftPatch, o?: { now?: boolean }) => queue.save(patch, o),
    upload: (file: File) => queue.upload(file),
    setCover: (file: File | null) => queue.setCover(file),
    flush: () => queue.flush(),
    discard: () => queue.discard(),
    pause: () => queue.pause(),
    resume: () => queue.resume(),
    reset: (revision: number, images: string[]) => queue.reset(revision, images),
    setRevision: (revision: number) => queue.setRevision(revision),
    dirty: () => queue.dirty(),
    /** The state right now, for code that runs after an await. */
    current: () => queue.state,
  }
}

export type Autosave = ReturnType<typeof useAutosave>
