import { Suspense } from 'react';

import { RequestDetail } from '@/components/dashboard/request-detail';

export default async function DashboardRequestPage({ params }: PageProps<'/dashboard/requests/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <RequestDetail id={id} />
    </Suspense>
  );
}
