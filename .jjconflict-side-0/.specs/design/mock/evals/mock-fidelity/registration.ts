/** Read build declarations without mounting React, a DOM, network, or Chromium. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import type { SitePayload } from "./scoring.ts"

export const mockRoot = fileURLToPath(new URL("../../", import.meta.url))
export const defaultDists = ["dist-default-ui", "dist-smithers-site", "dist-effeck-site", "dist-effect-monorepo"]
export const registrationFor = (dist: string): SitePayload => {
  const html = readFileSync(resolve(mockRoot, dist, "index.html"), "utf8")
  const script = /<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (!script) throw new Error(`No inline module in ${dist}`)
  const window: { location: { search: string; hash: string; pathname: string }; addEventListener(): void; removeEventListener(): void; __SITE__?: SitePayload } = {
    location: { search: "?still=1", hash: "", pathname: "/" }, addEventListener() {}, removeEventListener() {}
  }
  // document is intentionally absent: registration precedes React mounting.
  try { runInNewContext(script, { window, URL, URLSearchParams, console }, { timeout: 10_000 }) }
  catch (error) {
    if (!window.__SITE__) throw new Error(`Could not read registrations in ${dist}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  const site = window.__SITE__
  if (!site?.screens || !site?.routes) throw new Error(`No __SITE__ registrations in ${dist}`)
  // Return ordinary local records; Suite.make rejects foreign VM prototypes.
  return JSON.parse(JSON.stringify({ site: site.site, screens: site.screens, routes: site.routes }))
}
export const htmlSha256For = (dist: string): string => createHash("sha256").update(readFileSync(resolve(mockRoot, dist, "index.html"))).digest("hex")
