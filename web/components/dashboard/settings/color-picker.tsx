"use client"

import { useRef } from "react"
import { Slider } from "@/components/ui/slider"

type Hsv = { h: number; s: number; v: number }

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (k: number) => {
    const x = (k + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255)
  }
  return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")
}

/** A saturation/brightness area plus a hue slider. `hsv` is held by the parent so the hue
 *  survives when saturation or brightness hits 0. */
export function ColorPicker({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
  const area = useRef<HTMLDivElement>(null)

  const pick = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect()
    const clamp = (x: number) => Math.min(1, Math.max(0, x))
    onChange({ ...hsv, s: clamp((e.clientX - r.left) / r.width), v: 1 - clamp((e.clientY - r.top) / r.height) })
  }

  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (!d) return
    e.preventDefault()
    const clamp = (x: number) => Math.min(1, Math.max(0, x))
    onChange({ ...hsv, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) })
  }

  return (
    <div className="flex w-56 flex-col gap-3">
      <div
        ref={area}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-md bg-[linear-gradient(to_top,#000,transparent),linear-gradient(to_right,#fff,transparent)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)}
        onKeyDown={nudge}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }}
        />
      </div>
      <Slider
        aria-label="Hue"
        min={0}
        max={359}
        value={[Math.round(hsv.h)]}
        onValueChange={(v) => onChange({ ...hsv, h: Array.isArray(v) ? v[0] : v })}
        // The thumb matches the area's: a white ring filled with the current hue.
        style={{ "--thumb": `hsl(${hsv.h} 100% 50%)` } as React.CSSProperties}
        className="[&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-track]]:h-3 [&_[data-slot=slider-track]]:bg-[linear-gradient(to_right,red,#ff0,lime,cyan,blue,#f0f,red)] [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-(--thumb) [&_[data-slot=slider-thumb]]:shadow-[0_0_0_1px_rgb(0_0_0/0.3)] [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-thumb]]:active:ring-0"
      />
    </div>
  )
}
