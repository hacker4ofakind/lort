import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { AccountMenu } from "@/components/board/account-menu"
import { pb } from "@/lib/pocketbase"

// A token PocketBase's isValid accepts: a JWT whose exp is an hour away.
function token() {
  const part = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, "")
  return `${part({ alg: "HS256" })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

describe("AccountMenu", () => {
  it("opens from the avatar and signs a board user out", async () => {
    act(() => pb.authStore.save(token(), { id: "u1", collectionName: "users", name: "Mara", email: "mara@example.com" } as never))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountMenu />
      </QueryClientProvider>
    )
    await userEvent.click(screen.getByRole("button", { name: /Mara/ }))
    expect(await screen.findByText("mara@example.com")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))
    expect(pb.authStore.isValid).toBe(false)
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })
})
