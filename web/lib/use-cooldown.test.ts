import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCooldown } from "@/lib/use-cooldown"

afterEach(() => vi.useRealTimers())

describe("useCooldown", () => {
  it("is ready again after the cooldown", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCooldown(10_000))
    expect(result.current[0]).toBe(true)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(9_999))
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBe(true)
  })
})
