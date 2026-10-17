import { Suspense } from "react"
import { FeedbackBoard } from "@/components/board/feedback-board"

export default function FeedbackPage() {
  return (
    <Suspense>
      <FeedbackBoard />
    </Suspense>
  )
}
