// `pnpm start`: runs the standalone build the way the Docker image will (`output: "standalone"`
// in next.config.ts), instead of `next start`, which doesn't support standalone output. The
// standalone server doesn't include .next/static or public, so they're copied next to it first.
// It listens on 127.0.0.1:3000 by default; Lort's Go server is the public listener in front of it.
import { spawn } from "node:child_process"
import { cpSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..")
const standalone = join(root, ".next", "standalone")
if (!existsSync(join(standalone, "server.js"))) {
  console.error("No standalone build yet. Run `pnpm build` first.")
  process.exit(1)
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true })
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true })

const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: { PORT: "3000", HOSTNAME: "127.0.0.1", ...process.env },
})
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig))
server.on("exit", (code) => process.exit(code ?? 0))
