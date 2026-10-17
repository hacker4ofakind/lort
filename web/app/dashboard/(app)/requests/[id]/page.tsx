import { Suspense } from "react"
import { TeamRequest } from "@/components/dashboard/team-request"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <TeamRequest id={id} />
    </Suspense>
  )
}
