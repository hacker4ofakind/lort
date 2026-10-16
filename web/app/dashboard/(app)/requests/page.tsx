import { Suspense } from 'react';

import { RequestsTable } from '@/components/dashboard/requests-table';

export const metadata = { title: 'Requests' };

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsTable />
    </Suspense>
  );
}
