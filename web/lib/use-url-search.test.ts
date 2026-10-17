import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUrlSearch } from "@/lib/use-url-search"

describe("useUrlSearch", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (url: string) => {
    const commit = vi.fn()
    const hook = renderHook(({ url }) => useUrlSearch(url, commit), { initialProps: { url } })
    return { commit, hook, value: () => hook.result.current[0], type: (v: string) => act(() => hook.result.current[1](v)) }
  }

  it("writes the URL 300 ms after the last key", () => {
    const { commit, type } = setup("")
    type("da")
    type("dark")
    act(() => vi.advanceTimersByTime(299))
    expect(commit).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(commit).toHaveBeenCalledExactlyOnceWith("dark")
  })

  it("follows the URL when clearing filters removes an active search", () => {
    const { commit, hook, value } = setup("dark")
    hook.rerender({ url: "" })
    expect(value()).toBe("")
    act(() => vi.advanceTimersByTime(1000))
    expect(commit).not.toHaveBeenCalled()
  })

  it("follows back and forward between search URLs", () => {
    const { commit, hook, value, type } = setup("")
    type("dark")
    act(() => vi.advanceTimersByTime(300))
    hook.rerender({ url: "dark" }) // the write lands
    hook.rerender({ url: "" }) // back
    expect(value()).toBe("")
    hook.rerender({ url: "dark" }) // forward
    expect(value()).toBe("dark")
    act(() => vi.advanceTimersByTime(1000))
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it("keeps what you're typing when its own earlier write lands", () => {
    const { commit, hook, value, type } = setup("")
    type("ab")
    act(() => vi.advanceTimersByTime(300))
    type("abc")
    hook.rerender({ url: "ab" })
    expect(value()).toBe("abc")
    act(() => vi.advanceTimersByTime(300))
    expect(commit).toHaveBeenLastCalledWith("abc")
  })
})
