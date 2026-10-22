import { EditorPage } from "@/components/dashboard/changelog/editor/editor-page"

export const metadata = { title: "Edit post" }

// Next 16: route params are a promise.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EditorPage key={id} id={id} />
}
