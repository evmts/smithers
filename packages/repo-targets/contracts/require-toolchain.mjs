/**
 * The toolchain floor a test run refuses to start below.
 *
 * Root `package.json` `engines` holds the Bun and Node floors (kept equal to
 * `.smithers/WORKSPACE.ts` by `check-toolchain-pins.mjs`). A leaf module that
 * imports only `node:` builtins every runtime has, so an old runtime reaches
 * the refusal instead of an unrelated import error.
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** The numeric floor of a `>=x.y.z` requirement, or of a bare `x.y.z`. */
export const floorOf = (requirement) => {
  const match = /^(?:>=)?(\d+)\.(\d+)\.(\d+)/.exec(requirement.trim())
  if (match === null) throw new Error(`unreadable version requirement: ${JSON.stringify(requirement)}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export const compare = (left, right) => {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

/**
 * The one-line refusal for a running toolchain below the `engines` floors, or
 * null when it meets them. `found` holds the measured releases; an absent
 * runtime is not judged. A prerelease counts as its release, as the build
 * runtime's `>=` does.
 */
export const toolchainRefusal = (engines, found) => {
  const below = ["bun", "node"].some((key) =>
    found[key] !== undefined && compare(floorOf(found[key]), floorOf(engines[key])) < 0
  )
  if (!below) return null
  const measured = [["Bun", found.bun], ["Node", found.node]]
    .filter(([, release]) => release !== undefined)
    .map(([name, release]) => `${name} ${release}`)
  return `Smithers requires Bun ${engines.bun} and Node ${engines.node}; found ${measured.join(", ")}.`
}

/**
 * The release of the `node` on PATH, or undefined when there is none or it
 * printed no release. Bun's spawn on Linux CI can report a clean exit with
 * empty output for every later file of a long run (#3763); an unread Node is
 * not judged, as an absent one is not, rather than failing each file's preload.
 * It says so in one line holding what the spawn returned, for #3763.
 */
const nodeOnPath = () => {
  const result = spawnSync("node", ["--version"], { encoding: "utf8", timeout: 5_000 })
  if (result.error?.code === "ENOENT") return undefined
  const stdout = String(result.stdout ?? "")
  const release = result.status === 0 ? stdout.trim().replace(/^v/, "") : ""
  if (/^\d+\.\d+\.\d+/.test(release)) return release
  process.stderr.write(`require-toolchain: Node unmeasured: node --version gave status ${result.status}, signal ${result.signal}, error ${result.error?.code ?? "none"}, stdout ${JSON.stringify(stdout.slice(0, 80))}, stderr ${String(result.stderr ?? "").length} bytes (#3763)\n`)
  return undefined
}

/**
 * Stops the process with the refusal before any test runs. Under Bun,
 * `process.versions.node` is Bun's emulation, so Node is measured on PATH.
 */
export const requireToolchain = (manifest = fileURLToPath(new URL("../../../package.json", import.meta.url))) => {
  const { engines } = JSON.parse(readFileSync(manifest, "utf8"))
  const bun = process.versions.bun
  const refusal = toolchainRefusal(engines, { bun, node: bun === undefined ? process.versions.node : nodeOnPath() })
  if (refusal === null) return
  process.stderr.write(`${refusal}\n`)
  process.exit(1)
}
