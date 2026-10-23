"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { IconAdjustments, IconInbox, IconLayoutKanban, IconLayoutSidebarLeftCollapse, IconNews } from "@tabler/icons-react"
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
import { hasLeaveGuard, mayLeave } from "@/lib/leave-guard"
import { keys } from "@/lib/query"

// Docs joins this list in Phase 6.
const TOP = [
  { href: "/dashboard/requests", label: "Requests", icon: IconInbox },
  { href: "/dashboard/roadmap", label: "Roadmap", icon: IconLayoutKanban },
  { href: "/dashboard/changelog", label: "Changelog", icon: IconNews },
]
const BOTTOM = [{ href: "/dashboard/settings", label: "Settings", icon: IconAdjustments }]

/** The dashboard sidebar: 244px, collapsing to a 76px rail (remembered in a cookie); a sheet on phones. */
export function AppSidebar() {
  const config = useConfig()
  const pathname = usePathname()
  const router = useRouter()
  const profile = useUser()
  const { state, toggleSidebar } = useSidebar()
  const counts = useQuery({ queryKey: keys.stats, queryFn: () => stats(pbAdmin) })

  const item = (i: (typeof TOP)[number], badge?: number) => (
    <SidebarMenuItem key={i.href}>
      <SidebarMenuButton
        isActive={pathname.startsWith(i.href)}
        tooltip={i.label}
        render={
          <Link
            href={i.href}
            onClick={async (e) => {
              // A page with unsaved work (the changelog editor) gets to save it first.
              if (!hasLeaveGuard()) return
              e.preventDefault()
              if (await mayLeave()) router.push(i.href)
            }}
          />
        }
      >
        <i.icon />
        <span>{i.label}</span>
      </SidebarMenuButton>
      {!!badge && <SidebarMenuBadge>{badge} new</SidebarMenuBadge>}
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon" className="border-r-surface-2">
      {/* Everything here follows the target state (data-target), never the delayed layout flip, and
          nothing changes direction: the logo stays pinned top-left, the toggle slides from beside it
          to below it, so the end of a collapse has nothing left to snap. */}
      <SidebarHeader className="relative h-[68px] flex-row items-start gap-2.5 pt-5 pr-5 pb-[18px] pl-5 transition-[height,padding] duration-200 ease-linear group-data-[target=icon]:h-[106px] group-data-[target=icon]:pl-[23px]">
        <LogoMark appName={config.appName} logo={config.logo} size={30} />
        <span className="flex-1 truncate font-display text-[17px] leading-[30px] font-extrabold transition-opacity duration-150 group-data-[target=icon]:opacity-0">
          {config.appName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
          className="absolute top-[21px] right-5 transition-[top,right] duration-200 ease-linear group-data-[target=icon]:top-[60px] group-data-[target=icon]:right-6 max-md:hidden"
        >
          <IconLayoutSidebarLeftCollapse className="size-[18px] transition-transform duration-200 ease-linear group-data-[target=icon]:rotate-180" />
        </Button>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <SidebarMenu className="gap-1">
          {TOP.map((i) => item(i, i.label === "Requests" ? counts.data?.new : undefined))}
        </SidebarMenu>
        <div className="flex-1" />
        <SidebarMenu className="gap-1">{BOTTOM.map((i) => item(i))}</SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="px-5 pt-3 pb-4 transition-[padding] duration-200 ease-linear group-data-[target=icon]:px-6">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-full text-left"
              />
            }
          >
            {/* Named by its content, not an aria-label: the visible text (and the avatar's
                initial) must be part of the name (WCAG 2.5.3). The spaces keep the words apart. */}
            <PersonAvatar person={{ id: profile?.id ?? "", name: profile?.name ?? "", avatar: profile?.avatar, team: true }} size={28} />{" "}
            <span className="flex-1 truncate text-caption font-semibold transition-opacity duration-150 group-data-[target=icon]:opacity-0 group-data-[collapsible=icon]:hidden">{profile?.name}</span>{" "}
            <span className="text-micro font-normal text-muted-foreground transition-opacity duration-150 group-data-[target=icon]:opacity-0 group-data-[collapsible=icon]:hidden">Lort {config.version}</span>
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
