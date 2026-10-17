// Starts the Go server for Playwright with a fresh database in e2e/.data.
import { spawn } from "node:child_process"
import { rmSync } from "node:fs"
import { join } from "node:path"

const data = join(import.meta.dirname, ".data")
rmSync(data, { recursive: true, force: true })

const go = spawn("go", ["run", "."], {
  cwd: join(import.meta.dirname, "..", "..", "server"),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    LORT_DATA: data,
    LORT_URL: "http://localhost:4052",
    LORT_ADMIN_EMAIL: "admin@lort.test",
    LORT_ADMIN_PASSWORD: "correcthorse-e2e",
  },
})

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => go.kill(sig))
go.on("exit", (code) => process.exit(code ?? 0))
