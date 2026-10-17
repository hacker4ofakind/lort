"use client"

import { useEffect, useState } from "react"
import { BoardsSection } from "@/components/dashboard/settings/boards-section"
import { BrandingSection } from "@/components/dashboard/settings/branding-section"
import { SettingsSection } from "@/components/dashboard/settings/section"
import { TagsSection } from "@/components/dashboard/settings/tags-section"
import { TeamSection } from "@/components/dashboard/settings/team-section"
import { useSettings } from "@/components/dashboard/settings/use-settings"
import { Bone } from "@/components/lort/bone"
import { cn } from "@/lib/utils"

// Services (Email, Voice, Spam protection), Connect (Widget, MCP, Webhooks), Server (Backups,
// Updates) and the Roadmap switch join this list in later phases.
const TOC = [
  {
    group: "Your board",
    items: [
      { id: "branding", label: "Branding" },
      { id: "boards", label: "Boards" },
      { id: "tags", label: "Tags" },
      { id: "team", label: "Team" },
    ],
  },
]

/** /dashboard/settings: one page, an in-page table of contents, each section saving on change. */
export function SettingsPage() {
  const { settings, save } = useSettings()
  const [current, setCurrent] = useState("branding")

  // Highlight the section nearest the top of the viewport.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setCurrent(top.target.id)
      },
      { rootMargin: "-10% 0px -70% 0px" }
    )
    TOC.flatMap((g) => g.items).forEach((i) => {
      const el = document.getElementById(i.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <main className="px-4 pt-6 pb-20 sm:px-10 sm:pt-[30px]">
      <div className="mx-auto grid max-w-[1040px] items-start gap-8 md:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="md:sticky md:top-6">
          <h1 className="mb-3.5 ml-3 font-display text-[30px] font-extrabold tracking-[-0.025em]">Settings</h1>
          {TOC.map((g) => (
            <div key={g.group} className="max-md:hidden">
              <div className="px-3 pt-3.5 pb-1 text-[12px] font-bold text-muted-foreground">{g.group}</div>
              {g.items.map((i) => (
                <a
                  key={i.id}
                  href={`#${i.id}`}
                  aria-current={current === i.id ? "location" : undefined}
                  className={cn(
                    "block rounded-full px-3 py-1.5 text-label text-muted-foreground hover:text-foreground",
                    current === i.id && "bg-surface-2 text-foreground"
                  )}
                >
                  {i.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-5">
          {settings.data ? (
            <BrandingSection settings={settings.data} save={save} />
          ) : (
            <SettingsSection id="branding" title="Branding" lede="How your board looks to your users. Lort stays in the background.">
              <div aria-busy="true" className="flex flex-col gap-5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex flex-1 flex-col gap-2">
                      <Bone w={120} h={14} />
                      <Bone w="60%" h={12} />
                    </div>
                    <Bone w={i === 2 ? 300 : 120} h={30} />
                  </div>
                ))}
              </div>
            </SettingsSection>
          )}
          <BoardsSection />
          <TagsSection />
          <TeamSection />
        </div>
      </div>
    </main>
  )
}
