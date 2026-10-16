import { DashboardShell } from '@/components/dashboard/shell';

export default function DashboardAppLayout({ children }: LayoutProps<'/dashboard'>) {
  return <DashboardShell>{children}</DashboardShell>;
}
