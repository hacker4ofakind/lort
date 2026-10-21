"use client"

import { SettingRow, SettingsSection } from "@/components/dashboard/settings/section"
import type { Settings } from "@/components/dashboard/settings/use-settings"
import { Switch } from "@/components/ui/switch"

/** Settings → Roadmap: whether visitors can see the roadmap. Off removes the nav pill and the pages. */
export function RoadmapSection({ settings: s, save }: { settings: Settings; save: (d: object, done?: string) => Promise<void> }) {
  return (
    <SettingsSection id="roadmap" title="Roadmap">
      <SettingRow
        title="Show the roadmap publicly"
        description="People can see what's planned, in progress and shipped at /roadmap."
        htmlFor="roadmap-public"
      >
        <Switch
          id="roadmap-public"
          checked={s.roadmapPublic}
          onCheckedChange={(on) =>
            void save({ roadmapPublic: on }, on ? "The roadmap is public." : "The roadmap is hidden from the board.")
          }
        />
      </SettingRow>
    </SettingsSection>
  )
}
