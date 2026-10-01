/**
 * Prose claims in the package docs, pinned to the code they describe.
 *
 * Each of these drifted from the implementation: the docs named a third peer
 * the manifest never declared, allowed any loopback Origin when ingress
 * requires the Origin to equal the request authority, and said a
 * `Projection.Snapshot` request streams once it is sent over the socket.
 */
import * as Fs from "node:fs"
import { createRequire } from "node:module"
import * as Path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { maxEventBytes, maxEventsPerPage, maxEventsPerRun, maxProjectionBytes } from "../src/Projections.ts"

const packageRoot = Path.join(Path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file: string): string => Fs.readFileSync(Path.join(packageRoot, file), "utf8")

/** README.md plus every Markdown file under docs/, relative to the package. */
const docSources = (): ReadonlyArray<string> => [
  "README.md",
  ...(Fs.readdirSync(Path.join(packageRoot, "docs"), { recursive: true }) as Array<string>)
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => Path.join("docs", file))
]

/** The first prose paragraph of a Markdown file, past frontmatter and headings, on one line. */
const leadParagraph = (file: string): string =>
  (read(file).replace(/^---\n[\s\S]*?\n---\n/, "").trim().split("\n\n").find((block) => !block.startsWith("#")) ??
    "").replaceAll("\n", " ")

describe("the package docs", () => {
  const manifest = JSON.parse(read("package.json")) as {
    readonly peerDependencies: Record<string, string>
    readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
  }
  const peers = Object.keys(manifest.peerDependencies).sort()

  it.each(["README.md", "docs/api.md"])("%s names exactly the declared peers", (file) => {
    const lead = leadParagraph(file)
    const named = [...lead.matchAll(/`(@?[\w./-]+)`/g)].map((match) => match[1] as string)
      .filter((name) => name === "effect" || name.startsWith("@effect/"))
    expect([...new Set(named)].sort()).toEqual(peers)
    for (const [peer, meta] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
      if (meta.optional === true) expect(lead).toMatch(new RegExp(`\`${peer}\`[^.]*optional`))
    }
  })

  it.each(["README.md", "docs/README.md", "docs/api.md", "docs/troubleshooting.md", "docs/concepts/trust-boundary.md"])(
    "%s requires the Origin to match the request authority",
    (file) => {
      const prose = read(file).replaceAll(/\s+/g, " ")
      // The stale rule: any HTTP(S) Origin on a loopback name is accepted.
      expect(prose).not.toMatch(/Origin`? (?:must|that is not) (?:use|name|be|HTTP)[^.]*`?localhost`?, `?127\.0\.0\.1/)
      expect(prose).not.toContain("served from a loopback origin")
      expect(prose).toMatch(/Origin[^.]*(?:host and port|hostname and port)[^.]*(?:request|`Host`)/)
    }
  )

  it("follows a run over the socket with Projection.Subscribe", () => {
    const overview = read("docs/README.md").replaceAll(/\s+/g, " ")
    expect(overview).not.toContain("The same request on `/projections/ws`")
    expect(overview).toMatch(
      /Projection\.Subscribe[^.]*`\/projections\/ws`|`\/projections\/ws`[^.]*Projection\.Subscribe/
    )
  })

  it("describes event retention and paged history without promising a full-history refusal", () => {
    const section = read("docs/troubleshooting.md").split("### resource_limit\n")[1]?.split("\n### ")[0]
      ?.replaceAll(/\s+/g, " ")
    expect(section).toBeDefined()
    expect(section).toContain(`at most ${maxEventsPerRun.toLocaleString("en-US")} events`)
    expect(section).toContain(`and ${maxProjectionBytes / (1024 * 1024)} MiB of retained events`)
    expect(section).toContain("carried digest")
    expect(section).toContain(`at most ${maxEventsPerPage.toLocaleString("en-US")} events`)
    expect(section).toContain("pass that cursor as `after`")
    expect(section).toContain("`control.engine.event` payloads remain complete")
    expect(section).toContain("`flows.engine.plan-recorded`")
    expect(section).toContain("`flows.engine.subgraph-appended`")
    expect(section).toContain(`events within ${maxEventBytes / 1024} KiB`)
    expect(section).toContain(`projected row set exceeds ${maxProjectionBytes / (1024 * 1024)} MiB`)
    expect(section).not.toContain("Every run-scoped selector reads the full journal")
  })

  it.each(docSources())("%s contains no em-dash", (file) => {
    expect(read(file)).not.toContain("—")
  })
})

/** Every TypeScript file under src/, relative to the package. */
const srcSources = (): ReadonlyArray<string> =>
  (Fs.readdirSync(Path.join(packageRoot, "src"), { recursive: true }) as Array<string>)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => Path.join("src", file))

describe("the package manifest and source references", () => {
  it("installs exactly source imports and pinned private-adapter runtime dependencies", () => {
    type Manifest = {
      readonly name: string
      readonly version: string
      readonly dependencies?: Record<string, string>
      readonly devDependencies?: Record<string, string>
      readonly peerDependencies?: Record<string, string>
      readonly optionalDependencies?: Record<string, string>
      readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
      readonly smthrs?: { readonly privateEffectAdapters?: ReadonlyArray<string> }
    }
    const manifest = JSON.parse(read("package.json")) as Manifest
    // A type-only import is erased at build time and needs no installed package.
    const imported = new Set(
      srcSources().flatMap((file) =>
        [
          ...read(file).replaceAll(/(?:import|export) type [\s\S]*?from "[^"]*"/g, "").matchAll(
            /from "(@[\w-]+\/[\w-]+|[\w-]+)[/"]/g
          )
        ].map((match) => match[1] as string)
      )
    )
    const adapters = ["@effect/platform-bun", "@effect/platform-node", "@effect/platform-node-shared"]
    const effectVersion = "4.0.0-rc.115"
    const runtime = { undici: "8.10.2", redis: "6.2.1", "@types/ws": "8.18.1", ws: "8.21.3" }
    expect(manifest.smthrs?.privateEffectAdapters).toEqual(adapters)
    expect(manifest.peerDependencies?.effect).toBe(effectVersion)
    expect(manifest.dependencies?.effect).toBeUndefined()

    // The bundled adapters still use these ordinary installed packages. Read
    // their real manifests independently of the build helper, and pin the
    // whole closure so an extra package or a version range cannot pass.
    const require = createRequire(Path.join(packageRoot, "package.json"))
    const externals = new Map<string, string>()
    for (const name of adapters) {
      expect(manifest.dependencies?.[name]).toBeUndefined()
      expect(manifest.peerDependencies?.[name]).toBeUndefined()
      expect(manifest.optionalDependencies?.[name]).toBeUndefined()
      expect(manifest.devDependencies?.[name]).toBe(effectVersion)
      const adapterPath = require.resolve(`${name}/package.json`)
      const adapter = require(adapterPath) as Manifest
      expect(adapter.name).toBe(name)
      expect(adapter.version).toBe(effectVersion)
      const own = createRequire(adapterPath)
      for (const dependency of Object.keys({ ...adapter.dependencies, ...adapter.peerDependencies })) {
        if (
          adapters.includes(dependency) || dependency === "effect" ||
          adapter.peerDependenciesMeta?.[dependency]?.optional === true
        ) continue
        const selected = own(`${dependency}/package.json`) as Manifest
        expect((require(`${dependency}/package.json`) as Manifest).version).toBe(selected.version)
        externals.set(dependency, selected.version)
      }
    }
    expect(Object.fromEntries(externals)).toEqual(runtime)
    for (const [name, version] of Object.entries(runtime)) {
      expect(manifest.dependencies?.[name]).toBe(version)
    }
    const direct = [...imported].filter((name) =>
      !adapters.includes(name) &&
      manifest.peerDependencies?.[name] === undefined
    )
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([...direct, ...Object.keys(runtime)].sort())
    for (const name of direct) expect(manifest.dependencies?.[name]).toBe(manifest.version)
  })

  it("cites only docs files that exist", () => {
    for (const file of srcSources()) {
      // Join JSDoc lines so a path wrapped across ` * ` continuations is read whole.
      const prose = read(file).replaceAll(/\n\s*\* ?/g, "")
      for (const match of prose.matchAll(/`(docs\/[\w./-]+\.md)`/g)) {
        expect(Fs.existsSync(Path.join(packageRoot, match[1] as string)), `${file} cites ${match[1]}`).toBe(true)
      }
    }
    const changelog = read("CHANGELOG.md")
    expect(changelog).not.toContain("docs/Manifest.ts")
    expect(changelog).not.toContain("docsPages")
  })
})
