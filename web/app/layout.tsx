import type { Metadata } from "next"
import localFont from "next/font/local"
import { headers } from "next/headers"

import "./globals.css"
import { Providers } from "@/app/providers"
import { brandCss } from "@/lib/colors"
import { CONFIG_HEADER, parseConfig } from "@/lib/config"
import { favicon } from "@/lib/favicon"
import { cn } from "@/lib/utils"

// Variable fonts shipped in the repo (app/fonts, SIL OFL 1.1), so building needs no network.
const figtree = localFont({
  src: "./fonts/figtree-latin-wght.woff2",
  variable: "--font-figtree",
  weight: "400 700",
})
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin-wght.woff2",
  variable: "--font-bricolage",
  weight: "700 800",
})

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
