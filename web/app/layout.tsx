import type { Metadata } from "next"
import { Bricolage_Grotesque, Figtree } from "next/font/google"
import { headers } from "next/headers"

import "./globals.css"
import { Providers } from "@/app/providers"
import { brandCss } from "@/lib/colors"
import { CONFIG_HEADER, parseConfig } from "@/lib/config"
import { favicon } from "@/lib/favicon"
import { cn } from "@/lib/utils"

// Self-hosted at build time by next/font.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", weight: ["400", "500", "600", "700"] })
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["700", "800"] })

export async function generateMetadata(): Promise<Metadata> {
  const config = parseConfig((await headers()).get(CONFIG_HEADER))
  return {
    title: { default: config.appName, template: `%s · ${config.appName}` },
    icons: { icon: favicon(config) },
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = parseConfig((await headers()).get(CONFIG_HEADER))
  return (
    <html lang="en" suppressHydrationWarning className={cn(figtree.variable, bricolage.variable)}>
      <head>
        {/* The owner's primary colour, in both themes (lib/colors.ts keeps it AA). */}
        <style id="lort-brand">{brandCss(config.primaryColor)}</style>
      </head>
      <body>
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  )
}
