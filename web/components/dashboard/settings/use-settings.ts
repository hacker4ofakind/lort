"use client"

import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { errorMessage } from "@/lib/errors"
import { pbAdmin } from "@/lib/pocketbase"
import { keys } from "@/lib/query"

export interface Settings {
  id: string
  appName: string
  logo: string
  primaryColor: string
  showLandingCard: boolean
  roadmapPublic: boolean
}

/** The settings record and a save that refreshes everything showing the brand. */
export function useSettings() {
  const qc = useQueryClient()
  const router = useRouter()
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: () => pbAdmin.collection("settings").getFirstListItem<Settings>(""),
  })

  /** Saves on change, silently; only a failure toasts. router.refresh() re-renders the server layout, which reads the new brand from X-Lort-Config. */
  const save = async (data: Partial<Settings> | { logo: File | null }, _done?: string) => {
    if (!settings.data) return
    try {
      await pbAdmin.collection("settings").update(settings.data.id, data)
      await qc.invalidateQueries({ queryKey: keys.settings })
      router.refresh()
    } catch (err) {
      toast(errorMessage(err))
    }
  }

  return { settings, save }
}

/** After a board or tag change: the dashboard's lists and the brand header (public boards, tags) both refresh. */
export function useCatalogRefresh() {
  const qc = useQueryClient()
  const router = useRouter()
  return async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: keys.boards }), qc.invalidateQueries({ queryKey: keys.tags })])
    router.refresh()
  }
}
