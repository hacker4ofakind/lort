"use client"

import { useSyncExternalStore } from "react"
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

const IDS = TOC.flatMap((g) => g.items.map((i) => i.id))

// The scroll-spy reads where the sections are on every scroll, resize, layout change (sections
// grow as their data loads) and hash change, rather than keeping observer state that goes stale.
// A section you jump to (a link, or the hash on load) stays highlighted until you scroll yourself:
// the last sections can't scroll to the top of the page, so position alone can't show them.
let pinned = ""
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function pin(id: string) {
  pinned = id
  notify()
}

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const hash = decodeURIComponent(window.location.hash.slice(1))
  if (IDS.includes(hash)) pinned = hash
  const unpin = () => {
    if (pinned) pin("")
  }
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (SCROLL_KEYS.has(e.key) && !t?.closest("input, textarea, select, [contenteditable], [role=switch], button")) unpin()
  }
  window.addEventListener("scroll", onChange, { passive: true })
  window.addEventListener("resize", onChange)
  window.addEventListener("wheel", unpin, { passive: true })
  window.addEventListener("touchmove", unpin, { passive: true })
  window.addEventListener("keydown", onKey)
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onChange)
  ro?.observe(document.body)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("scroll", onChange)
    window.removeEventListener("resize", onChange)
    window.removeEventListener("wheel", unpin)
    window.removeEventListener("touchmove", unpin)
    window.removeEventListener("keydown", onKey)
    ro?.disconnect()
  }
}

/** The pinned section, else the last one whose top has passed a line near the top of the viewport. */
function currentSection(): string {
  if (pinned) return pinned
  // Scrolled all the way down: the last section, which may never reach the line.
  if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) return IDS[IDS.length - 1]
  const line = Math.min(160, window.innerHeight * 0.3)
  let current = IDS[0]
  for (const id of IDS) {
    const top = document.getElementById(id)?.getBoundingClientRect().top
    if (top !== undefined && top <= line) current = id
  }
  return current
}

/** /dashboard/settings: one page, an in-page table of contents, each section saving on change. */
export function SettingsPage() {
  const { settings, save } = useSettings()
  const current = useSyncExternalStore(subscribe, currentSection, () => IDS[0])

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
                  onClick={() => pin(i.id)}
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
            <SettingsSection id="branding" title="Branding">
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
