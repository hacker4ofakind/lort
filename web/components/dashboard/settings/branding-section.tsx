"use client"

import { useRef, useState } from "react"
import { SettingRow, SettingsSection } from "@/components/dashboard/settings/section"
import type { Settings } from "@/components/dashboard/settings/use-settings"
import { LogoMark } from "@/components/lort/logo-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { fileUrl } from "@/lib/files"

/** The 8 presets from the spec (14.2). */
export const PRESETS = [
  { name: "Pink", hex: "#cc3a6d" },
  { name: "Coral", hex: "#d4553a" },
  { name: "Amber", hex: "#b7791f" },
  { name: "Leaf", hex: "#2f855a" },
  { name: "Teal", hex: "#0f8a8a" },
  { name: "Ocean", hex: "#2563eb" },
  { name: "Grape", hex: "#7c4dcc" },
  { name: "Graphite", hex: "#4b5563" },
]

const HEX = /^#[0-9a-f]{6}$/i

export function BrandingSection({ settings: s, save }: { settings: Settings; save: (d: object, done?: string) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(s.appName)
  const [hex, setHex] = useState(s.primaryColor)
  const [hexError, setHexError] = useState("")
  const logo = s.logo ? fileUrl("settings", s.id, s.logo) : ""
  const color = s.primaryColor.toLowerCase()

  return (
    <SettingsSection id="branding" title="Branding">
      <SettingRow title="App logo" description="Square PNG, SVG or WebP, at least 128 px.">
        <LogoMark appName={s.appName} logo={logo} size={56} className="rounded-[14px]" />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void save({ logo: f }, "Saved the new logo.")
            e.target.value = ""
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          {s.logo ? "Replace" : "Upload"}
        </Button>
        {s.logo && (
          <Button variant="ghost" size="sm" onClick={() => void save({ logo: null }, "Removed the logo.")}>
            Remove
          </Button>
        )}
      </SettingRow>
      <SettingRow title="App name" description="Shown in the top bar, emails and the browser tab." htmlFor="app-name">
        <Input
          id="app-name"
          className="h-10 w-[260px] max-w-full"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== s.appName) void save({ appName: name.trim() }, "Saved the app name.")
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </SettingRow>
      <SettingRow
        className="items-start max-sm:flex-col"
        title="Primary colour"
        description="Buttons, voted stickers and everything that's on. Lort adjusts custom colours so text on them stays readable in light and dark."
      >
        <div className="flex flex-col items-end gap-3 max-sm:items-start">
          <ToggleGroup
            aria-label="Primary colour presets"
            value={PRESETS.some((p) => p.hex === color) ? [color] : []}
            onValueChange={(v) => {
              if (!v[0]) return
              setHex(v[0])
              void save({ primaryColor: v[0] }, "Saved the colour.")
            }}
            className="flex-wrap gap-2.5"
          >
            {PRESETS.map((p) => (
              <Toggle
                key={p.hex}
                value={p.hex}
                aria-label={p.name}
                style={{ backgroundColor: p.hex }}
                className="size-[30px] rounded-full p-0 hover:opacity-90 data-pressed:shadow-[0_0_0_3px_var(--card),0_0_0_5px_var(--foreground)]"
              />
            ))}
          </ToggleGroup>
          <label className="flex items-center gap-2 text-caption font-normal text-muted-foreground">
            Custom
            {/* A live preview the size of the presets: what you've typed once it's a valid hex,
                otherwise the saved colour. */}
            <span
              aria-hidden
              className="size-[30px] shrink-0 rounded-full"
              style={{ backgroundColor: HEX.test(hex.trim()) ? hex.trim() : s.primaryColor }}
            />
            <Input
              aria-label="Custom hex colour"
              aria-invalid={!!hexError}
              className="h-10 w-[120px] font-mono text-caption"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => {
                const v = hex.trim()
                if (!HEX.test(v)) return setHexError("Use a hex colour like #2563eb.")
                setHexError("")
                if (v.toLowerCase() !== color) void save({ primaryColor: v.toLowerCase() }, "Saved the colour.")
              }}
            />
          </label>
          {hexError && (
            <p role="alert" className="text-caption font-medium text-danger">
              {hexError}
            </p>
          )}
        </div>
      </SettingRow>
      <SettingRow
        title="Show “Get your own board” card"
        description="“Powered by Lort” in the footer stays either way."
        htmlFor="landing-card"
      >
        <Switch
          id="landing-card"
          checked={s.showLandingCard}
          onCheckedChange={(on) => void save({ showLandingCard: on }, on ? "The card is back." : "Hid the card.")}
        />
      </SettingRow>
    </SettingsSection>
  )
}
