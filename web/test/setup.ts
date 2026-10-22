import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
  // Node-environment tests (the share card) have no working localStorage.
  if (typeof globalThis.localStorage?.clear === "function") localStorage.clear()
})
