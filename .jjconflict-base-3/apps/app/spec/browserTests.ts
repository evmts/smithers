import { spawnSync } from "node:child_process"
const result = spawnSync("pnpm", ["exec", "playwright", "test", "--config", "playwright.spec.config.ts", "--workers=1"], { stdio: "inherit" })
if (result.error) throw result.error
process.exit(result.status ?? 1)
