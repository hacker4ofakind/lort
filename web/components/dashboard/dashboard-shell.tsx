"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useConfig } from "@/app/providers"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { FailedBanner } from "@/components/dashboard/changelog/failed-banner"
import { useAdminSession } from "@/components/dashboard/session"
import { LogoMark } from "@/components/lort/logo-mark"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// Pages that need the width: the roadmap and the changelog editor (not the changelog list). Opened
// directly they start with the sidebar as the 76px rail; reached from another page they keep it.
const DENSE_PAGES = [/^\/dashboard\/roadmap/, /^\/dashboard\/changelog\/[^/]+$/]

export function isDense(pathname: string): boolean {
  return DENSE_PAGES.some((p) => p.test(pathname))
}

/**
 * Guards the dashboard (superusers only) and lays out the sidebar and the page. The sidebar's
 * remembered state (the cookie) belongs to the normal pages. A dense page has its own state that
 * starts closed on every visit, never touches the cookie, and is forgotten when you leave.
 */
export function DashboardShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  useAdminSession()
  const config = useConfig()
  const pathname = usePathname()
  const dense = isDense(pathname)
  const [remembered, setRemembered] = useState(defaultOpen)
  const [visitOpen, setVisitOpen] = useState(false)
  // Reset the per-visit state when the page changes: state derived during render, not an effect.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    // Arriving from a normal page keeps the sidebar as it is, so flipping through the pages
    // doesn't animate it; only opening a dense page directly starts it as the rail.
    if (!isDense(lastPath)) setVisitOpen(remembered)
  }
  return (
    <SidebarProvider
      open={dense ? visitOpen : remembered}
      onOpenChange={dense ? setVisitOpen : setRemembered}
      persist={!dense}
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        {/* Phones: a top bar with the menu, which opens the sidebar as a sheet. */}
        <div className="flex h-14 items-center gap-2.5 border-b px-4 md:hidden">
          <SidebarTrigger aria-label="Open the menu" />
          <LogoMark appName={config.appName} logo={config.logo} size={26} />
          <span className="font-display text-base font-extrabold">{config.appName}</span>
        </div>
        <FailedBanner />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
