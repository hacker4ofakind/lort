"use client"

import { useQuery } from "@tanstack/react-query"
import { fileUrl } from "@/lib/files"
import { pbAdmin, type Client } from "@/lib/pocketbase"

/**
 * A file token for protected images, when the request isn't public. Tokens last a few minutes,
 * so it refreshes every 90 seconds while the page is open.
 */
export function useFileToken(client: Client, needed: boolean): string | undefined {
  const token = useQuery({
    queryKey: ["file-token", client === pbAdmin ? "team" : "board"],
    queryFn: () => client.files.getToken(),
    enabled: needed && client.authStore.isValid,
    staleTime: 90_000,
    refetchInterval: 90_000,
  })
  return token.data
}

export interface RequestImagesProps {
  collection: "requests" | "comments"
  recordId: string
  images: string[]
  /** A file token when the request isn't public (see useFileToken). */
  token?: string
  /** The request title, for alt text. */
  about: string
}

/** Up to three thumbnails; each opens the full image in a new tab. */
export function RequestImages({ collection, recordId, images, token, about }: RequestImagesProps) {
  if (images.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((name, i) => (
        <a
          key={name}
          href={fileUrl(collection, recordId, name, { token })}
          target="_blank"
          rel="noreferrer"
          className="block size-24 overflow-hidden rounded-sm bg-surface-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- PocketBase serves the thumbnail */}
          <img
            src={fileUrl(collection, recordId, name, { thumb: "200x200", token })}
            alt={`Image ${i + 1} for ${about}`}
            className="size-full object-cover"
          />
        </a>
      ))}
    </div>
  )
}
