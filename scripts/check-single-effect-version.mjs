/** Effect-family declarations, locked versions, and live package resolution.
 * Physical identity is a necessary check, not proof against arbitrary loader
 * namespaces. The executable loading contract has separate instance tests.
 */
import { createRequire } from "node:module"
import { readFileSync, realpathSync } from "node:fs"
import { join, resolve } from "node:path"

import { workspacePackages, isMain, repoRoot } from "./workspace-packages.mjs"
import { readWorkspaceManifests } from "./pack-release.mjs"

/**
 * The Effect release this repository is built and tested on. Update the family
 * atomically with manifests and both package-manager locks.
 */
export const EXPECTED_EFFECT_VERSION = "4.0.4"

/**
 * The Effect range a published library accepts from the application that
 * installs it.
 *
 * The floor is the tested release, never lower. `@smthrs/flows` installs
 * `@effect/sql-sqlite-node` at exactly that release, and the adapter peers
 * `effect` from its own version up, so a lower floor would promise an install
 * the adapter refuses.
 */
export const SUPPORTED_EFFECT_RANGE = `^${EXPECTED_EFFECT_VERSION}`

/**
 * The last release candidate this repository ran on. It is below the supported
 * range, so the consumer gate installs it to prove a strict install refuses it.
 */
export const UNSUPPORTED_EFFECT_VERSION = "4.0.0-rc.115"

/** `@effect/*` packages that are not on the Effect release line. */
const offReleaseLine = new Set([
  // The TypeScript language-service plugin has its own version line.
  "@effect/language-service"
])
const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
/**
 * Every `@effect/*` package ships with `effect` at the same version, so the
 * family is the scope and not a list: an adapter this file has never heard of
 * is checked the day a manifest or a lockfile names it.
 */
const isFamily = (name) => name === "effect" || name.startsWith("@effect/") && !offReleaseLine.has(name)

/**
 * What one Effect-family entry of a manifest must declare.
 *
 * A published library takes `effect` from the application that installs it,
 * so its Effect peers are the supported range: the application picks one
 * `effect` and the adapters that go with it. Everything a package installs for
 * itself is the tested release: development dependencies, an adapter a library
 * lists as a regular dependency, and every entry of an executable. An
 * executable installs its own `effect`, so the adapters it asks its installer
 * for must be the ones built for that release.
 */
export const expectedEffectDeclaration = (manifest, section) =>
  section === "peerDependencies" && manifest.private !== true && manifest.peerDependencies?.effect !== undefined
    ? SUPPORTED_EFFECT_RANGE
    : EXPECTED_EFFECT_VERSION

export const effectDeclarations = (manifest, source) => sections.flatMap((section) =>
  Object.entries(manifest[section] ?? {}).filter(([name]) => isFamily(name))
    .map(([name, version]) => ({
      name, version, expected: expectedEffectDeclaration(manifest, section), source: `${source} (${section})`
    })))

/** Read resolved package entries, including quoted scoped pnpm keys. */
export const effectLockVersions = (text, format) => {
  const pattern = format === "pnpm"
    ? /^ {2}['"]?(@effect\/[^@\s]+|effect)@([^:'"\s(]+)(?:\([^\n]*\))?['"]?:$/gm
    : /"[^"\n]+"\s*:\s*\[\s*"(@effect\/[^@"\s]+|effect)@([^"\s]+)"/g
  return [...text.matchAll(pattern)].filter((match) => isFamily(match[1]))
    .map((match) => ({ name: match[1], version: match[2], source: format === "pnpm" ? "pnpm-lock.yaml" : "bun.lock" }))
}

/**
 * Fails unless every record carries what it must: the range for a published
 * library's peer, the tested release for everything else. A locked or
 * installed version has no `expected` and is always the tested release. The
 * comparison is exact both ways, so an exact pin in a library peer is refused
 * the same as a range in a dependency.
 */
export const assertEffectPins = (records) => {
  const wrong = records.filter(({ version, expected = EXPECTED_EFFECT_VERSION }) => version !== expected)
  if (wrong.length > 0) throw new Error(
    `Effect-family entries off the release policy (${EXPECTED_EFFECT_VERSION}; a published library's peers ${SUPPORTED_EFFECT_RANGE}):\n` +
    wrong.map(({ name, version, expected = EXPECTED_EFFECT_VERSION, source }) =>
      `  ${source}: ${name}@${version} must be ${expected}`).join("\n"))
}

/**
 * `@effect/platform-bun` and `@effect/platform-node` ask for
 * `@effect/platform-node-shared` with a caret range, so a fresh consumer
 * resolves its newest release candidate, which imports Effect modules the
 * pinned `effect` lacks: `smithers-orchestrator@0.32.0` exited before MCP
 * `initialize` that way (#2398). A published package that declares either
 * platform must therefore declare `@effect/platform-node-shared` itself: in
 * `dependencies`, at the tested release, when the platform is a dependency;
 * there or in `peerDependencies` when the platform is a peer. A peer carries
 * what {@link expectedEffectDeclaration} gives that package's peers, so an
 * application that picks the platform picks the shared adapter with it.
 */
const platformsNeedingShared = ["@effect/platform-bun", "@effect/platform-node"]
export const nodeSharedPinProblems = (manifests) => {
  const problems = []
  for (const [directory, manifest] of manifests) {
    for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      const platforms = platformsNeedingShared.filter((name) => Object.hasOwn(manifest[section] ?? {}, name))
      if (platforms.length === 0) continue
      const allowed = section === "peerDependencies" ? ["dependencies", "peerDependencies"] : ["dependencies"]
      const wanted = allowed.map((where) => [where, expectedEffectDeclaration(manifest, where)])
      const pinned = wanted.some(([where, expected]) => manifest[where]?.["@effect/platform-node-shared"] === expected)
      if (!pinned) {
        problems.push(`${directory} (${manifest.name}): ${section} declares ${platforms.join(" and ")} without ` +
          `@effect/platform-node-shared at ${wanted.map(([where, expected]) => `${expected} in ${where}`).join(" or ")}`)
      }
    }
  }
  return problems
}

export const assertNodeSharedPins = (manifests) => {
  const problems = nodeSharedPinProblems(manifests)
  if (problems.length > 0) throw new Error(`Published packages leave @effect/platform-node-shared to a transitive caret range:\n  ${problems.join("\n  ")}`)
}

/**
 * A published library's optional Effect adapter is declared in
 * `peerDependenciesMeta` alone, with no `peerDependencies` entry.
 *
 * npm `--strict-peer-deps` loads the newest version an optional peer range
 * allows into the peer set even when nothing installs it, and that adapter
 * peers `effect` from its own version up. With `^4.0.4` here, an application
 * pinned at 4.0.4 was refused the day a 4.0.5 adapter existed; an exact peer
 * instead refuses an application that picks a later adapter. Without the
 * entry npm adds no edge and pnpm treats the name as an optional peer of any
 * version: the application chooses the adapter, and the adapter's own `effect`
 * peer holds it to the application's Effect. An executable installs its own
 * Effect, so its exact optional peers are not this rule.
 */
export const optionalAdapterPeerProblems = (manifests) => {
  const problems = []
  for (const [directory, manifest] of manifests) {
    if (manifest.private === true || manifest.peerDependencies?.effect === undefined) continue
    for (const [name, version] of Object.entries(manifest.peerDependencies)) {
      if (name === "effect" || !isFamily(name) || manifest.peerDependenciesMeta?.[name]?.optional !== true) continue
      problems.push(`${directory} (${manifest.name}): optional peer ${name}@${version} must be declared in peerDependenciesMeta only`)
    }
  }
  return problems
}

/** Missing and malformed installs fail closed; same-version private Effect copies fail too. */
export const installedEffectResolutions = (root, manifests) => {
  const rootEffect = realpathSync(createRequire(join(root, "package.json")).resolve("effect/package.json"))
  const records = []
  for (const [directory, manifest] of manifests) {
    const require = createRequire(join(root, directory, "package.json"))
    const declarations = effectDeclarations(manifest, directory)
    for (const name of new Set(declarations.map((entry) => entry.name))) {
      const path = realpathSync(require.resolve(`${name}/package.json`))
      const installed = JSON.parse(readFileSync(path, "utf8"))
      if (installed.name !== name) throw new Error(`${directory}: ${name} resolves to ${installed.name} at ${path}`)
      records.push({ name, version: installed.version, source: `${directory} resolves ${path}` })
      if (name === "effect" && path !== rootEffect) {
        throw new Error(`${directory}: a different physical Effect instance resolves at ${path}; root uses ${rootEffect}`)
      }
      if (name !== "effect") {
        const adapterEffect = realpathSync(createRequire(path).resolve("effect/package.json"))
        if (adapterEffect !== rootEffect) throw new Error(`${directory}: ${name} resolves a different physical Effect instance at ${adapterEffect}`)
      }
    }
  }
  return records
}

export const checkEffectVersions = (root = repoRoot) => {
  const manifestRecords = [
    ...effectDeclarations(JSON.parse(readFileSync(join(root, "package.json"), "utf8")), "package.json"),
    ...workspacePackages(root).flatMap((entry) => effectDeclarations(entry.manifest, `${entry.dir}/package.json`))
  ]
  const locked = [
    ...effectLockVersions(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"), "pnpm"),
    ...effectLockVersions(readFileSync(join(root, "bun.lock"), "utf8"), "bun")
  ]
  for (const format of ["pnpm-lock.yaml", "bun.lock"]) {
    if (!locked.some((entry) => entry.source === format && entry.name === "effect")) throw new Error(`${format}: no resolved Effect package`)
  }
  assertEffectPins([...manifestRecords, ...locked])
  const published = readWorkspaceManifests(root)
  assertNodeSharedPins(published)
  const optional = optionalAdapterPeerProblems(published)
  if (optional.length > 0) throw new Error(`Published libraries range an optional Effect adapter peer:\n  ${optional.join("\n  ")}`)
  const installed = installedEffectResolutions(root, published)
  assertEffectPins(installed)
  return { declarations: manifestRecords.length, locked: locked.length, resolutions: installed.length, packages: published.size }
}

if (isMain(import.meta)) {
  const result = checkEffectVersions()
  console.log(`check-single-effect-version: effect ${EXPECTED_EFFECT_VERSION}, published library peers ${SUPPORTED_EFFECT_RANGE}; ${result.declarations} declarations, ` +
    `${result.locked} locked entries, ${result.resolutions} installed resolutions across ${result.packages} published packages; one physical Effect`)
}
