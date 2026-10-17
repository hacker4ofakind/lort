// Points shadcn components at Lort's configured cn (lib/utils.ts). The shadcn CLI writes
// `import { cn } from "cn"`, which does not know Lort's text sizes and shadows.
// Run after every `pnpm dlx shadcn@latest add`: `pnpm ui:fix`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = join(import.meta.dirname, "..", "components", "ui")
for (const name of readdirSync(dir)) {
  const file = join(dir, name)
  const src = readFileSync(file, "utf8")
  const out = src.replace(/from ["']cn["']/g, 'from "@/lib/utils"')
  if (out !== src) writeFileSync(file, out)
}
