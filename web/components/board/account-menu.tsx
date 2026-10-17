"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { useRequireUser } from "@/components/board/auth-gate"
import { ProfileDialog } from "@/components/board/profile-dialog"
import { PersonAvatar } from "@/components/lort/person-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUser } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"

/** The avatar at the right of the top bar, or Sign in. */
export function AccountMenu({ size = 38 }: { size?: number }) {
  const user = useUser()
  const requireUser = useRequireUser()
  const qc = useQueryClient()
  const [profileOpen, setProfileOpen] = useState(false)

  if (!user) {
    return (
      <Button variant="secondary" onClick={() => requireUser()}>
        Sign in
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" className="rounded-full" aria-label="Your account" />}
        >
          <PersonAvatar person={{ ...user, team: user.isAdmin }} size={size} keyline />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="text-caption font-semibold text-foreground">
            {user.name}
            <span className="block font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>Your profile</DropdownMenuItem>
          {user.isAdmin && <DropdownMenuItem render={<Link href="/dashboard/requests" />}>Dashboard</DropdownMenuItem>}
          <DropdownMenuItem
            onClick={async () => {
              pb.authStore.clear()
              await qc.invalidateQueries()
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}
