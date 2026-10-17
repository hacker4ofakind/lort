"use client"

import { useConfig } from "@/app/providers"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { useAdminSession } from "@/components/dashboard/session"
import { LogoMark } from "@/components/lort/logo-mark"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

/** Guards the dashboard (superusers only) and lays out the sidebar and the page. */
export function DashboardShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  useAdminSession()
  const config = useConfig()
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        {/* Phones: a top bar with the menu, which opens the sidebar as a sheet. */}
        <div className="flex h-14 items-center gap-2.5 border-b px-4 md:hidden">
          <SidebarTrigger aria-label="Open the menu" />
          <LogoMark appName={config.appName} logo={config.logo} size={26} />
          <span className="font-display text-base font-extrabold">{config.appName}</span>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
