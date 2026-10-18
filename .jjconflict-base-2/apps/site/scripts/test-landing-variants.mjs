/** Build both compile-time actions and exercise their real browser doors. */
import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const root = fileURLToPath(new URL("../../../", import.meta.url))
const copyPath = new URL("../src/data/landingCopy.ts", import.meta.url)
const original = readFileSync(copyPath, "utf8")
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" })
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`)
}
try {
  for (const action of ["open", "install"]) {
    writeFileSync(copyPath, original.replace('landingAction: "install",', `landingAction: "${action}",`))
    const env = { SMITHERS_LANDING_TEST_ACTION: action }
    run("pnpm", ["--filter", "smithers-app", "exec", "playwright", "test", "--config", "playwright.site.config.ts", "e2e/site/first-visit-launcher.spec.ts", "--grep", action === "open" ? "held open variant" : "signed-out static install landing"], env)
    run(process.execPath, ["--test", "apps/site/scripts/landing-html.test.mjs"], env)
  }
} finally { writeFileSync(copyPath, original) }
