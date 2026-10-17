"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { IconAdjustments, IconInbox, IconLayoutSidebarLeftCollapse } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { signOutAdmin } from "@/components/dashboard/session"
import { LogoMark } from "@/components/lort/logo-mark"
import { PersonAvatar } from "@/components/lort/person-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { stats } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

// Roadmap and Changelog join this list in Phase 2, Docs in Phase 6.
const TOP = [{ href: "/dashboard/requests", label: "Requests", icon: IconInbox }]
const BOTTOM = [{ href: "/dashboard/settings", label: "Settings", icon: IconAdjustments }]

/** The dashboard sidebar: 244px, collapsing to a 76px rail (remembered in a cookie); a sheet on phones. */
export function AppSidebar() {
  const config = useConfig()
  const pathname = usePathname()
  const router = useRouter()
  const profile = useUser()
  const { toggleSidebar } = useSidebar()
  const counts = useQuery({ queryKey: keys.stats, queryFn: () => stats(pbAdmin) })

  const item = (i: (typeof TOP)[number], badge?: number) => (
    <SidebarMenuItem key={i.href}>
      <SidebarMenuButton isActive={pathname.startsWith(i.href)} tooltip={i.label} render={<Link href={i.href} />}>
        <i.icon />
        <span>{i.label}</span>
      </SidebarMenuButton>
      {!!badge && <SidebarMenuBadge>{badge} new</SidebarMenuBadge>}
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon" className="border-r-surface-2">
      <SidebarHeader className="flex-row items-center gap-2.5 px-5 pt-5 pb-[18px] group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-2">
        <LogoMark appName={config.appName} logo={config.logo} size={30} />
        <span className="flex-1 truncate font-display text-[17px] font-extrabold group-data-[collapsible=icon]:hidden">
          {config.appName}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Collapse sidebar" onClick={toggleSidebar} className="max-md:hidden">
          <IconLayoutSidebarLeftCollapse className="size-[18px] group-data-[collapsible=icon]:rotate-180" />
        </Button>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <SidebarMenu className="gap-1">{TOP.map((i) => item(i, counts.data?.new))}</SidebarMenu>
        <div className="flex-1" />
        <SidebarMenu className="gap-1">{BOTTOM.map((i) => item(i))}</SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="px-5 pt-3 pb-4 group-data-[collapsible=icon]:px-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-full text-left group-data-[collapsible=icon]:justify-center"
              />
            }
          >
            {/* Named by its content, not an aria-label: the visible text (and the avatar's
                initial) must be part of the name (WCAG 2.5.3). The spaces keep the words apart. */}
            <PersonAvatar person={{ id: profile?.id ?? "", name: profile?.name ?? "", avatar: profile?.avatar, team: true }} size={28} />{" "}
            <span className="flex-1 truncate text-caption font-semibold group-data-[collapsible=icon]:hidden">{profile?.name}</span>{" "}
            <span className="text-micro font-normal text-muted-foreground group-data-[collapsible=icon]:hidden">Lort {config.version}</span>
            <span className="sr-only">, your account</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-52">
            <DropdownMenuItem render={<Link href="/feedback" />}>View the board</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                signOutAdmin()
                router.replace("/dashboard/login")
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
