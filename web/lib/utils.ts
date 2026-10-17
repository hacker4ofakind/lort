import { createCn } from "cn/config"

/**
 * Class merging (clsx + tailwind-merge semantics) that knows Lort's theme. Without the
 * extension, cn reads an unknown text-* as a colour, so cn("text-label", "text-foreground")
 * would drop the font size. Every component imports cn from here, never from "cn".
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["display-xl", "display-l", "title", "count", "body-lg", "body", "label", "caption", "micro"],
      shadow: ["sticker", "float", "card-float"],
    },
  },
})
