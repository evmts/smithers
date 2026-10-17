/**
 * Every smithers.sh URL a published package ships or prints lands on a page of
 * the built site that is about the URL's own path.
 *
 * The target builds the site before running this gate. It stays offline:
 * `apps/site/scripts/published-links.mjs` reads the emitted files under `apps/site/dist`
 * and the `_redirects` the build copies there, redirects first, as the host
 * does. That module holds the rules and their reasons; `--live` runs the same
 * rules against production after a deploy.
 *
 * Until issue 3845 this gate asked only that a URL reach an emitted route,
 * through at most one redirect. `https://smithers.sh/migration/1.0` passed it
 * while redirecting to the install page, for three reasons this version closes:
 * the destination did not have to be about the path, a fragment was never
 * checked, and TypeScript was read in comments only, where the `//` of
 * `https://` cut every string literal's URL in half before the pattern saw it.
 *
 * Run it with `pnpm exec smithers-build test '//scripts/repo-contract:smithersLinks'`.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { collect, composed, failure, offenders, readRedirects } from "../../apps/site/scripts/published-links.mjs"
import { repoRoot as root } from "../workspace-packages.mjs"

const output = join(root, "apps", "site", "dist")

describe("smithers.sh links in shipping packages", () => {
  it("renders archived changelog media with their captions", () => {
    const html = readFileSync(join(output, "changelogs", "0230", "index.html"), "utf8")
    assert.match(
      html,
      /<figure[^>]*>[\s\S]*?<img[^>]*src="\/images\/why\/crash-resume.gif"[\s\S]*?<figcaption[^>]*>Durability is the whole point:/
    )
  })

  it("land on a built page about their own path, fragment included", async () => {
    assert.ok(existsSync(output), "apps/site/dist is missing; run `pnpm -C apps/site build` first")
    const rules = readRedirects(readFileSync(join(output, "_redirects"), "utf8"))
    const references = [...collect(root), ...composed(root)]
    assert.ok(references.length > 100, `expected the published packages' links, found ${references.length}`)
    const failed = await offenders(references, (url) => failure(url, output, rules))
    assert.deepEqual(failed, [], `smithers.sh URLs that do not reach a page about their path:\n  ${failed.join("\n  ")}`)
  })

  it("serve the migration guide every 0.x project is sent to", () => {
    const rules = readRedirects(readFileSync(join(output, "_redirects"), "utf8"))
    for (const url of ["https://smithers.sh/migration/1.0", "https://smithers.sh/migration/1.0#run-data"]) {
      assert.equal(failure(url, output, rules), undefined, url)
    }
  })
})
