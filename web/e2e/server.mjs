// Starts the Go server for Playwright with a fresh database in e2e/.data.
import { spawn } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

const data = join(import.meta.dirname, ".data")
// The e2e admin, shared with helpers.ts and test/e2e-container.sh.
const admin = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", "..", "test", "e2e.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
)
rmSync(data, { recursive: true, force: true })

const go = spawn("go", ["run", "."], {
  cwd: join(import.meta.dirname, "..", "..", "server"),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    LORT_DATA: data,
    LORT_URL: "http://localhost:4052",
    ...admin,
  },
})

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => go.kill(sig))
go.on("exit", (code) => process.exit(code ?? 0))
