import { cn } from "@/lib/utils"

export interface LogoMarkProps {
  appName: string
  /** The owner's uploaded logo URL; without one, the first letter on primary. */
  logo?: string
  size?: number
  className?: string
}

/** The app's logo mark, tilted −4° like a sticker on the wall. Decorative: the app name sits next to it. */
export function LogoMark({ appName, logo, size = 32, className }: LogoMarkProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.5) }
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded file served by PocketBase
      <img src={logo} alt="" style={style} className={cn("-rotate-4 rounded-sm object-cover shadow-sticker", className)} />
    )
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "grid -rotate-4 place-items-center rounded-sm bg-primary font-display font-extrabold text-primary-foreground shadow-sticker",
        className
      )}
    >
      {(appName.trim()[0] ?? "L").toUpperCase()}
    </span>
  )
}
