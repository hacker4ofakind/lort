import { Suspense } from "react"
import { PostsPage } from "@/components/dashboard/changelog/posts-page"

export const metadata = { title: "Changelog" }

export default function Page() {
  return (
    <Suspense>
      <PostsPage />
    </Suspense>
  )
}
