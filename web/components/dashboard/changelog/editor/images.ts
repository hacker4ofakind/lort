import { Fragment, Slice, type Node } from "@tiptap/pm/model"

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
export const IMAGE_MAX = 5 * 1024 * 1024

/** Why a file can't be a post image, or null when it can. */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Images must be PNG, JPEG, WebP or GIF."
  if (file.size > IMAGE_MAX) return "That image is over 5 MB."
  return null
}

/**
 * A pasted slice without images from anywhere but this post's own files: the public page drops
 * them (they would leak readers' IP addresses), so the editor doesn't show them either.
 */
export function dropForeignImages(slice: Slice, postId: string): Slice {
  const own = `/api/files/changelogs/${postId}/`
  const clean = (frag: Fragment): Fragment => {
    const nodes: Node[] = []
    frag.forEach((n) => {
      if (n.type.name === "image" && !String(n.attrs.src ?? "").startsWith(own)) return
      nodes.push(n.isText ? n : n.copy(clean(n.content)))
    })
    return Fragment.fromArray(nodes)
  }
  return new Slice(clean(slice.content), slice.openStart, slice.openEnd)
}
