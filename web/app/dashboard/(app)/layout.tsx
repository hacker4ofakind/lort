import { cookies } from "next/headers"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

// The sidebar remembers whether it was collapsed in shadcn's sidebar_state cookie; reading it
// here renders the right width on the first paint.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const open = (await cookies()).get("sidebar_state")?.value !== "false"
  return <DashboardShell defaultOpen={open}>{children}</DashboardShell>
}
