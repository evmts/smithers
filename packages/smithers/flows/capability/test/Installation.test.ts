import { expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

it.each(["README.md", "docs/README.md", "docs/installation.md", "docs/api.md"])(
  "%s names every runtime dependency and the effect range the manifest peers",
  (path) => {
    const document = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

    for (const name of Object.keys(manifest.dependencies)) {
      expect(document).toContain(`\`${name}\``)
    }
    // The peer is a range an application's own effect has to fall in, never
    // one exact version.
    expect(manifest.peerDependencies.effect).toMatch(/^\^\d+\.\d+\.\d+$/)
    expect(document).toContain(`\`effect@${manifest.peerDependencies.effect}\``)
    expect(document).not.toMatch(/effect[^.\n]*\bpinned\b/)
  }
)
