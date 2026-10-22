import type { Metadata } from "next"
import { headers } from "next/headers"
import { PublicPost } from "@/components/board/changelog/public-post"
import { PAGE_HEADER } from "@/lib/page-meta"
import { postMetadata } from "@/lib/post-metadata"

// The Go proxy describes the post in X-Lort-Page, so Next never asks PocketBase for it.
export async function generateMetadata(): Promise<Metadata> {
  return postMetadata((await headers()).get(PAGE_HEADER))
}

// Next 16: route params are a promise.
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PublicPost slug={slug} />
}
