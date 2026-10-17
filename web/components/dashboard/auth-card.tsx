"use client"

import Link from "next/link"
import { useConfig } from "@/app/providers"
import { LORT_HOME } from "@/components/board/links"
import { LogoMark } from "@/components/lort/logo-mark"

/** The centred card of the dashboard's sign-in and invite pages, with "Powered by Lort" under it. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const config = useConfig()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 px-4 py-10">
      <section className="flex w-[400px] max-w-full flex-col gap-[18px] rounded-xl border bg-card px-[30px] pt-8 pb-7">
        <div className="mb-1 flex flex-col items-center gap-3.5 text-center">
          <LogoMark appName={config.appName} logo={config.logo} size={52} className="rounded-[14px]" />
          <div>
            <h1 className="font-display text-2xl leading-[30px] font-bold tracking-[-0.01em]">{title}</h1>
            <p className="mt-1.5 text-label font-normal text-muted-foreground">
              For the {config.appName} team. Looking for the board?{" "}
              <Link href="/feedback" className="font-semibold text-primary-text hover:underline">
                Go to feedback
              </Link>
            </p>
          </div>
        </div>
        {children}
      </section>
      <a href={LORT_HOME} className="text-caption font-normal text-muted-foreground hover:text-foreground">
        Powered by <b className="font-bold text-foreground">Lort</b>
      </a>
    </main>
  )
}
