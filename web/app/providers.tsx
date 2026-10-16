'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/lib/toast';

let browserClient: QueryClient | undefined;

function queryClient() {
  const make = () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
  // A fresh client per server render; one shared client in the browser.
  if (typeof window === 'undefined') return make();
  browserClient ??= make();
  return browserClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient()}>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
