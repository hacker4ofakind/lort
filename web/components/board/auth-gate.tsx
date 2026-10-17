"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { AuthForm } from "@/components/board/auth-form"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { pb } from "@/lib/pocketbase"

type RequireUser = (then?: () => void) => void

const AuthGateContext = createContext<RequireUser | null>(null)

/**
 * Hosts the account dialog for the public site. requireUser(then) runs `then` straight away
 * for a signed-in visitor, or opens the dialog and runs it after they sign in or sign up
 * (a sticker click becomes a vote once they're in).
 */
export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pending = useRef<(() => void) | undefined>(undefined)

  const requireUser = useCallback<RequireUser>((then) => {
    if (pb.authStore.isValid) {
      then?.()
      return
    }
    pending.current = then
    setOpen(true)
  }, [])

  return (
    <AuthGateContext.Provider value={requireUser}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) pending.current = undefined
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogTitle className="sr-only">Your account</DialogTitle>
          <AuthForm
            onDone={() => {
              const then = pending.current
              pending.current = undefined
              setOpen(false)
              then?.()
            }}
          />
        </DialogContent>
      </Dialog>
    </AuthGateContext.Provider>
  )
}

/** Outside the public site (the dashboard, where the admin is always signed in) it just runs `then`. */
export function useRequireUser(): RequireUser {
  return useContext(AuthGateContext) ?? runIfSignedIn
}

function runIfSignedIn(then?: () => void) {
  if (pb.authStore.isValid) then?.()
}
