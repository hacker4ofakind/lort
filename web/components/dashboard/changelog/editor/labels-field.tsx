"use client"

import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup } from "@/components/ui/toggle-group"
import type { ChangelogLabel } from "@/lib/api"
import { isLabel, LABELS, sortLabels } from "@/lib/changelog"

/** New, Improved, Fixed as toggles; pressed is primary-soft. */
export function LabelsField({
  labels,
  editable,
  onChange,
}: {
  labels: ChangelogLabel[]
  editable: boolean
  onChange: (labels: ChangelogLabel[]) => void
}) {
  return (
    <ToggleGroup
      multiple
      aria-label="Labels"
      value={labels}
      disabled={!editable}
      onValueChange={(v) => onChange(sortLabels((v as string[]).filter(isLabel)))}
      spacing={2}
      className="flex-wrap"
    >
      {LABELS.map((l) => (
        <Toggle key={l.value} value={l.value} className="h-[30px] px-3 text-[13px] font-bold data-pressed:shadow-none">
          {l.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
