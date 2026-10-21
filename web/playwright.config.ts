import { defineConfig, devices } from "@playwright/test"

// One Lort server (Go on :4052, proxying to Next on :3000) with a fresh database per run.
// Tests share it, so they run one at a time and name what they create uniquely.
// LORT_E2E_CONTAINER=1 tests whatever already listens on 127.0.0.1:4052 instead, such as the
// image started by test/e2e-container.sh.
const container = process.env.LORT_E2E_CONTAINER === "1"

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:4052", trace: "retain-on-failure" },
  // Every test runs in both themes (WCAG AA in light and dark, spec section 12).
  projects: [
    {
      name: "dark",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      name: "light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
  ],
  webServer: container
    ? undefined
    : [
        {
          command: "pnpm build && pnpm start",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
        {
          command: "node e2e/server.mjs",
          url: "http://127.0.0.1:4052/api/lort/health",
          reuseExistingServer: false,
          timeout: 300_000,
        },
      ],
})
