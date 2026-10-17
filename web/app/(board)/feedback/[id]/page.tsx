import { PublicRequest } from "@/components/board/public-request"

// Next 16: route params are a promise.
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PublicRequest id={id} />
}
