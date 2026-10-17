"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// The scaffold's "D toggles the theme" hotkey is gone on purpose: visitors on a public board
// would trigger it by accident, and the design has no theme switch. The theme follows the
// visitor's system setting.
function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
