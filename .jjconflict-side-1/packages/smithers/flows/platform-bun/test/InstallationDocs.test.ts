import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

/** Collapse JSDoc gutters and wrapping so a claim reads as one line. */
const flatten = (text: string) => text.replace(/^\s*\*/gm, " ").replace(/\s+/g, " ")

const manifest = JSON.parse(read("../package.json")) as {
  readonly version: string
  readonly peerDependencies: Record<string, string>
  readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
  readonly smthrs: { readonly privateEffectAdapters: ReadonlyArray<string> }
}

/** The package an import specifier resolves through, or undefined for built-ins and relative paths. */
const packageOf = (specifier: string) => {
  if (specifier.startsWith(".") || specifier.startsWith("node:") || specifier.startsWith("bun:")) return undefined
  const segments = specifier.split("/")
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]
}

/** Every package the page's TypeScript blocks import. */
const importedPackages = (page: string) =>
  [...read(page).matchAll(/^```ts\n([\s\S]*?)^```/gm)]
    .flatMap(([, block]) => [...block!.matchAll(/^import [^"]+ from "([^"]+)"/gm)].map(([, specifier]) => specifier!))
    .map(packageOf)
    .filter((name): name is string => name !== undefined)

/** The package names on the page's first `bun add` line, without versions. */
const bunAddPackages = (page: string) => {
  const line = read(page).match(/bun add ((?:@?[\w./-]+(?:@[\w.-]+)?[ \t]*)+)/)?.[1]
  return (line ?? "").trim().split(/\s+/).map((entry) => entry.replace(/(.)@.*$/, "$1"))
}

const requiredPeers = Object.keys(manifest.peerDependencies)
  .filter((name) => manifest.peerDependenciesMeta?.[name]?.optional !== true)
  .sort()

describe("Installation docs", () => {
  it("require jj only for Jj operations in installation and quickstart", () => {
    // Every `BunHost` factory builds without jj (#3894): the `BunJj` slot
    // probes on its first operation, so only a `Jj` call fails `not_installed`.
    for (const page of ["../docs/installation.md", "../docs/quickstart.md"]) {
      const text = flatten(read(page))
      expect(text).toMatch(/jj 0\.39\.0 or (later|newer)/)
      expect(text).toMatch(/Jujutsu/)
      expect(text).toMatch(/builds? without jj/)
      expect(text).toContain("not_installed")
      expect(text).not.toMatch(/while the layer is built|at construction|before the program body runs/)
    }
  })

  it("installs the published package, whose peer ships the filesystem helper", () => {
    // `scripts/set-release-version.mjs` stamps these lines at every release.
    for (const page of ["../README.md", "../docs/README.md", "../docs/installation.md", "../docs/quickstart.md"]) {
      const text = flatten(read(page))
      expect(text, page).toContain(`bun add @smthrs/platform-bun@${manifest.version} effect`)
      expect(text, page).not.toMatch(/not on npm/i)
      expect(text, page).not.toMatch(/cargo build/)
    }
  })

  it("documents that every host factory builds without jj", () => {
    const source = read("../src/BunHost.ts")
    for (const factory of ["layer", "layerAt", "layerContained", "layerContainedAt"]) {
      const declaration = source.search(new RegExp(`\\nexport const ${factory}\\b`))
      expect(declaration, factory).toBeGreaterThan(0)
      const jsdoc = flatten(source.slice(source.lastIndexOf("/**", declaration), declaration))
      expect(jsdoc, factory).toMatch(/[Bb]uilds( on a host)? without jj/)
      expect(jsdoc, factory).not.toMatch(/Fails at construction/)
    }
  })

  it("quotes the contained factories' signature in troubleshooting", () => {
    const source = flatten(read("../src/BunHost.ts"))
    const signature = source.match(/layerContained = \([^)]*\): (Layer\.Layer<[^>]+>)/)?.[1]
    expect(signature).toBeDefined()
    const troubleshooting = flatten(read("../docs/troubleshooting.md"))
    expect(troubleshooting).toContain(signature!)
    expect(troubleshooting).not.toMatch(/Layer\.Layer<BunHost, never,/)
  })

  it("declares every package the quickstart programs import on the install line", () => {
    // contained.ts imports @smthrs/kernel/ProcessLedger; Bun's isolated linker
    // and pnpm resolve only declared packages, so an unlisted kernel fails (#4016).
    const imported = [...new Set(importedPackages("../docs/quickstart.md"))].sort()
    expect(imported).toContain("@smthrs/kernel")
    for (const page of ["../docs/quickstart.md", "../docs/installation.md"]) {
      const declared = bunAddPackages(page)
      for (const name of imported) expect(declared, `${page} declares ${name}`).toContain(name)
    }
  })

  it("never tells a reader to install an adapter the package bundles privately", () => {
    // Every published 1.x manifest bundles these; the troubleshooting page
    // once called @effect/platform-bun a required peer (#3989).
    const adapters = manifest.smthrs.privateEffectAdapters
    expect(adapters).toContain("@effect/platform-bun")
    for (const page of ["../README.md", "../docs/README.md", "../docs/installation.md", "../docs/troubleshooting.md"]) {
      const text = flatten(read(page))
      for (const adapter of adapters) {
        expect(text, `${page} installs ${adapter}`).not.toMatch(
          new RegExp(`(npm install|pnpm add|bun add)( [^ \`]+)* ${adapter}(@| |\`|$)`)
        )
        expect(text, `${page} calls ${adapter} a peer`).not.toContain(`required \`${adapter}\` peer`)
      }
    }
  })

  it("documents the manifest's required peers as required", () => {
    expect(requiredPeers.length).toBeGreaterThan(0)
    for (const page of ["../README.md", "../docs/installation.md"]) {
      const text = flatten(read(page))
      for (const peer of requiredPeers) expect(text, `${page} names ${peer}`).toContain(`\`${peer}\``)
      expect(text).not.toMatch(/is not a peer of this package/)
      expect(text).not.toMatch(/not a peer/)
    }
    expect(flatten(read("../docs/README.md"))).not.toMatch(/optional peer/)
  })
})
