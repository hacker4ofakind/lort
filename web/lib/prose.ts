/**
 * The one look for a post's body, on the public page, in Preview and in the editor (spec 15.1,
 * P-Changelog-Post): body 17/28 in ink-2, h2 in display 24/30, inline code on surface-2, 68ch.
 * Tailwind child variants, so the rendered markdown and Tiptap's content share it.
 */
export const PROSE = [
  "max-w-[68ch] text-[17px] leading-7 text-ink-2",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:mb-4",
  "[&_h2]:mt-[34px] [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-[24px] [&_h2]:leading-[30px] [&_h2]:font-extrabold [&_h2]:tracking-[-0.02em] [&_h2]:text-ink",
  "[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-title [&_h3]:text-ink",
  "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-[22px] [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-[22px] [&_li]:mb-1 [&_li>p]:mb-1",
  "[&_code]:rounded-[6px] [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-ink",
  "[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:bg-surface-2 [&_pre]:p-3.5 [&_pre]:leading-6 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:mb-4 [&_blockquote]:rounded-[10px] [&_blockquote]:bg-surface-2 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:italic [&_blockquote>p:last-child]:mb-0",
  "[&_hr]:my-8 [&_hr]:border-t [&_hr]:border-border",
  "[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-[10px]",
  "[&_a]:font-semibold [&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-[3px]",
  "[&_strong]:font-bold [&_strong]:text-ink [&_del]:text-muted-foreground",
].join(" ")
