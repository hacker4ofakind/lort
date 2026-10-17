import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { avatarUrl } from "@/lib/files"
import { cn } from "@/lib/utils"

// Decorative fills for initials, never status colours; the dark initial reads on all of them.
const FILLS = ["bg-[#3ba3a0]", "bg-[#e0a84b]", "bg-[#8db4f2]", "bg-[#c99ae8]", "bg-[#7fcb8f]", "bg-[#e88f7f]"]

export function fillFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return FILLS[h % FILLS.length]
}

export interface PersonAvatarProps {
  person: { id: string; name: string; avatar?: string; team?: boolean }
  size?: number
  /** The sticker keyline (public pages). */
  keyline?: boolean
  className?: string
}

/** A person's picture, or their initial on a warm fill; team members get a primary ring. */
export function PersonAvatar({ person, size = 24, keyline = false, className }: PersonAvatarProps) {
  const name = person.name || "Someone"
  const src = person.avatar ? avatarUrl({ id: person.id, avatar: person.avatar }, size > 48 ? 200 : 100) : undefined
  return (
    <Avatar
      role="img"
      aria-label={person.team ? `${name} (team)` : name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      className={cn(
        "after:hidden",
        keyline && "border-2 border-keyline",
        person.team && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className={cn("font-extrabold text-[#1a1716]", fillFor(name))} aria-hidden>
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </Avatar>
  )
}
