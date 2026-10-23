import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { PROSE } from "@/lib/prose"
import { cn } from "@/lib/utils"

/** Only the post's own files render: a third-party image would leak readers' IP addresses. */
export const POST_FILES = "/api/files/changelogs/"

/** A post image's display URL: GIFs as they are (a thumb would freeze them), others width-capped. */
export function postImageSrc(src: string): string | null {
  if (!src.startsWith(POST_FILES)) return null
  if (/\.gif($|\?)/i.test(src) || src.includes("?")) return src
  return `${src}?thumb=1600x0`
}

const components: Components = {
  a({ href, title, children }) {
    const external = !!href && /^https?:\/\//i.test(href)
    return (
      <a href={href} title={title} rel={external ? "noopener noreferrer" : undefined}>
        {children}
      </a>
    )
  },
  img({ src, alt }) {
    const shown = typeof src === "string" ? postImageSrc(src) : null
    if (!shown) return null
    // eslint-disable-next-line @next/next/no-img-element -- user content from PocketBase, sized by its thumb
    return <img src={shown} alt={alt ?? ""} loading="lazy" />
  },
}

/**
 * A post's markdown body. react-markdown never renders raw HTML and its default URL transform
 * drops javascript: links; both defaults stay.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
