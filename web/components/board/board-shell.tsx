"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconSearch } from "@tabler/icons-react"
import { useConfig } from "@/app/providers"
import { AccountMenu } from "@/components/board/account-menu"
import { AuthGateProvider } from "@/components/board/auth-gate"
import { boardNav, LORT_HOME } from "@/components/board/links"
import { SearchField } from "@/components/board/search-field"
import { LogoMark } from "@/components/lort/logo-mark"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function isCurrent(pathname: string, href: string) {
  return href === "/feedback" ? pathname === "/" || pathname.startsWith("/feedback") : pathname.startsWith(href)
}

/** The public site's frame: top bar, the page, "Powered by Lort", and the optional "Get your own board" card. */
export function BoardShell({ children }: { children: React.ReactNode }) {
  const config = useConfig()
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)

  const nav = (
    <nav aria-label="Board" className="flex gap-1">
      {boardNav(config).map((item) => {
        const current = isCurrent(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-full px-[13px] py-[7px] text-label text-muted-foreground transition-colors hover:text-foreground sm:px-3.5 sm:py-2 sm:text-[15px]",
              current && "bg-surface-2 text-foreground"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <AuthGateProvider>
      <header className="mx-auto max-w-[1120px] px-4 pt-3.5 sm:flex sm:h-[76px] sm:items-center sm:gap-5 sm:px-8 sm:pt-0">
        <div className="flex items-center gap-2.5">
          <Link href="/feedback" className="flex flex-1 items-center gap-2.5 font-display text-lg font-extrabold sm:text-[19px]">
            <LogoMark appName={config.appName} logo={config.logo} size={32} />
            {config.appName}
          </Link>
          <div className="flex items-center gap-1 sm:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((o) => !o)}
            >
              <IconSearch />
            </Button>
            <AccountMenu size={34} />
          </div>
        </div>
        <div className="mt-2 sm:mt-0 sm:ml-2.5">{nav}</div>
        {searchOpen && <SearchField autoFocus className="mt-2 w-full sm:hidden" />}
        <div className="hidden flex-1 sm:block" />
        <SearchField className="hidden sm:block" />
        <div className="hidden sm:block">
          <AccountMenu />
        </div>
      </header>
      {children}
      <footer className="flex justify-center pt-14 pb-[140px]">
        <a href={LORT_HOME} className="text-caption font-normal text-muted-foreground hover:text-foreground">
          Powered by <b className="font-bold text-foreground">Lort</b>
        </a>
      </footer>
      {config.showLandingCard && (
        <a
          href={LORT_HOME}
          className="fixed bottom-[34px] left-6 z-20 hidden items-center gap-2.5 rounded-full border bg-card py-2 pr-4 pl-2 text-caption font-semibold inset-shadow-sm shadow-card-float xl:flex"
        >
          <span aria-hidden className="size-[26px] rotate-[8deg] rounded-full border-2 border-keyline bg-status-pending" />
          Get your own board like this
        </a>
      )}
    </AuthGateProvider>
  )
}
