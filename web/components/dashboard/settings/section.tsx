import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** One Settings section: a card with a title and an optional lede. */
export function SettingsSection({ id, title, lede, children }: { id: string; title: string; lede?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-lg border bg-card px-6 py-[22px]">
      <h2 id={`${id}-title`} className={cn("font-display text-title", !lede && "mb-[18px]")}>
        {title}
      </h2>
      {lede && <p className="mt-1 mb-[18px] max-w-[62ch] text-label font-normal text-muted-foreground">{lede}</p>}
      {children}
    </section>
  )
}

/** A setting: what it is and what it does on the left, the control on the right. */
export function SettingRow({
  title,
  description,
  children,
  className,
  htmlFor,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  /** The control's id, so the title labels it. */
  htmlFor?: string
}) {
  const Title = htmlFor ? "label" : "b"
  return (
    <div className={cn("flex items-center gap-4 border-t py-3.5 first-of-type:border-t-0", className)}>
      <div className="min-w-0 flex-1">
        <Title htmlFor={htmlFor} className="block text-[15px] font-semibold">
          {title}
        </Title>
        {description && <span className="mt-0.5 block text-caption font-normal text-muted-foreground">{description}</span>}
      </div>
      {children}
    </div>
  )
}
