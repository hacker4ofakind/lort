"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Lort: toasts sit bottom-centre above the floating bars, at most three at once, drawn as the
// design's pill-ish surface-2 card (inset-sm + float). No icons: the text says what happened.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      visibleToasts={3}
      offset={{ bottom: 104 }}
      mobileOffset={{ bottom: 96 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "relative flex min-h-12 w-(--width) items-center gap-3 overflow-hidden rounded-md border border-border-strong bg-surface-2 py-2 pr-2 pl-[18px] text-label font-medium text-foreground inset-shadow-sm shadow-float",
          title: "flex-1",
          description: "text-caption text-muted-foreground",
          actionButton: "h-8 rounded-full px-3 font-bold text-primary-text hover:bg-surface-3",
          cancelButton: "h-8 rounded-full px-3 text-muted-foreground hover:bg-surface-3",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
