import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useUser } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"

// A token PocketBase's isValid accepts: a JWT whose exp is an hour away.
function token() {
  const part = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, "")
  return `${part({ alg: "HS256" })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
}

let renders = 0
function Probe() {
  renders++
  const user = useUser()
  return <p>{user ? user.name : "signed out"}</p>
}

describe("useUser", () => {
  it("follows sign-in, rename and sign-out without a render loop", () => {
    renders = 0
    render(<Probe />)
    expect(screen.getByText("signed out")).toBeInTheDocument()

    act(() => pb.authStore.save(token(), { id: "u1", collectionName: "users", name: "Mara" } as never))
    expect(screen.getByText("Mara")).toBeInTheDocument()

    act(() => pb.authStore.save(pb.authStore.token, { id: "u1", collectionName: "users", name: "Mara K." } as never))
    expect(screen.getByText("Mara K.")).toBeInTheDocument()

    act(() => pb.authStore.clear())
    expect(screen.getByText("signed out")).toBeInTheDocument()
    expect(renders).toBeLessThan(10)
  })
})
