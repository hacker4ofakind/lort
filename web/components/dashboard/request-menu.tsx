"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { IconDots } from "@tabler/icons-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { RequestDetail } from "@/lib/api"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

/** The request page's overflow menu: Edit (title, body) and Delete. */
export function RequestMenu({ request: r }: { request: RequestDetail }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" className="mt-2" />}>
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit the request</DialogTitle>
          </DialogHeader>
          <EditForm request={r} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
      <DeleteDialog request={r} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}

function EditForm({ request: r, onDone }: { request: RequestDetail; onDone: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(r.title)
  const [body, setBody] = useState(r.body)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const save = async () => {
    if (title.trim().length < 3) return setError("Give it a title of at least 3 characters.")
    setPending(true)
    try {
      await pbAdmin.collection("requests").update(r.id, { title: title.trim(), body })
      await qc.invalidateQueries({ queryKey: ["request"] })
      await qc.invalidateQueries({ queryKey: ["requests"] })
      toast("Saved your changes.")
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="edit-title">Title</FieldLabel>
        <Input id="edit-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
        <FieldError>{error}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="edit-body">Details</FieldLabel>
        <Textarea id="edit-body" value={body} rows={6} maxLength={10000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function DeleteDialog({ request: r, open, onOpenChange }: { request: RequestDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{r.title}”?</AlertDialogTitle>
          <AlertDialogDescription>Its votes, comments and timeline go with it. This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                await pbAdmin.collection("requests").delete(r.id)
                await qc.invalidateQueries({ queryKey: ["requests"] })
                await qc.invalidateQueries({ queryKey: keys.stats })
                toast("Deleted the request.")
                router.replace("/dashboard/requests")
              } catch (err) {
                toast(errorMessage(err))
                setPending(false)
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
