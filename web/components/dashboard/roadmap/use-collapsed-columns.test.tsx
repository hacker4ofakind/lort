import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCollapsedColumns } from "@/components/dashboard/roadmap/use-collapsed-columns"
import { COLLAPSED_KEY } from "@/lib/roadmap"

describe("useCollapsedColumns", () => {
  it("starts with nothing collapsed and re-renders this tab when a column is toggled", () => {
    const { result } = renderHook(() => useCollapsedColumns())
    expect(result.current.collapsed).toEqual([])

    act(() => result.current.toggle("completed"))
    expect(result.current.collapsed).toEqual(["completed"])
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('["completed"]')

    act(() => result.current.toggle("planned"))
    expect(result.current.collapsed).toEqual(["completed", "planned"])

    act(() => result.current.toggle("completed"))
    expect(result.current.collapsed).toEqual(["planned"])
  })

  it("keeps a stable array between renders, so React doesn't loop", () => {
    localStorage.setItem(COLLAPSED_KEY, '["progress"]')
    const { result, rerender } = renderHook(() => useCollapsedColumns())
    const first = result.current.collapsed
    rerender()
    expect(result.current.collapsed).toBe(first)
  })

  it("treats junk in storage as nothing collapsed", () => {
    localStorage.setItem(COLLAPSED_KEY, "{not json")
    const { result } = renderHook(() => useCollapsedColumns())
    expect(result.current.collapsed).toEqual([])
  })

  it("follows another tab's change", () => {
    const { result } = renderHook(() => useCollapsedColumns())
    act(() => {
      localStorage.setItem(COLLAPSED_KEY, '["planned"]')
      window.dispatchEvent(new StorageEvent("storage", { key: COLLAPSED_KEY }))
    })
    expect(result.current.collapsed).toEqual(["planned"])
  })
})
