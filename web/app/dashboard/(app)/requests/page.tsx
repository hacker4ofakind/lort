import { Suspense } from "react"
import { RequestsPage } from "@/components/dashboard/requests-page"

export const metadata = { title: "Requests" }

export default function Page() {
  return (
    <Suspense>
      <RequestsPage />
    </Suspense>
  )
}
