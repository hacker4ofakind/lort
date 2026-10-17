"use client"

import { createContext, useContext, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SiteConfig } from "@/lib/config"
import { makeQueryClient } from "@/lib/query"

const ConfigContext = createContext<SiteConfig | null>(null)

/** The board's public config (brand, boards, tags, features), from the X-Lort-Config header. */
export function useConfig(): SiteConfig {
  const c = useContext(ConfigContext)
  if (!c) throw new Error("useConfig must be used inside <Providers>")
  return c
}

export function Providers({ config, children }: { config: SiteConfig; children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return (
    <ConfigContext.Provider value={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </MotionConfig>
        </ThemeProvider>
      </QueryClientProvider>
    </ConfigContext.Provider>
  )
}
