import { Suspense } from "react"
import { BoardShell } from "@/components/board/board-shell"

// The top bar's search reads the URL (useSearchParams), so the shell sits in a Suspense boundary.
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <BoardShell>{children}</BoardShell>
    </Suspense>
  )
}
