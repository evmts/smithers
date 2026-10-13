/**
 * The installed-CLI MCP check the release smoke runs (#2398).
 *
 * `smithers-orchestrator@0.32.0` exited before answering MCP `initialize`
 * because a fresh consumer resolved `@effect/platform-node-shared` past the
 * pinned Effect release. A workspace test cannot see that: only a consumer
 * install from the packed tarballs resolves third-party caret edges the way a
 * user's package manager does. These helpers speak the MCP handshake to an
 * installed `smthrs --mcp` and read every Effect-family package that consumer
 * resolved.
 */
import { spawn } from "node:child_process"
import { readdirSync, readFileSync, realpathSync } from "node:fs"
import { join } from "node:path"

import { satisfies } from "semver"

/**
 * Sends MCP `initialize` over stdio to `command args` and returns the
 * server's `serverInfo`. Rejects when the process exits, errors, answers with
 * an error, or does not answer within `timeoutMs`; the child is always killed.
 */
export const mcpInitialize = (command, args, { cwd, env = process.env, timeoutMs = 120_000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill("SIGKILL")
      if (error) reject(new Error(`${error}\nstderr:\n${stderr.slice(-4000)}`))
      else resolve(value)
    }
    const timer = setTimeout(() => finish(`MCP initialize timed out after ${timeoutMs} ms`), timeoutMs)
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      for (let end = stdout.indexOf("\n"); end >= 0; end = stdout.indexOf("\n")) {
        const line = stdout.slice(0, end).trim()
        stdout = stdout.slice(end + 1)
        if (line === "") continue
        let reply
        try { reply = JSON.parse(line) } catch { return finish(`MCP server wrote a non-JSON line: ${line.slice(0, 200)}`) }
        if (reply.id !== 1) continue
        if (reply.error !== undefined) return finish(`MCP initialize failed: ${JSON.stringify(reply.error)}`)
        const serverInfo = reply.result?.serverInfo
        if (typeof serverInfo?.version !== "string") return finish(`MCP initialize answered without serverInfo.version: ${line.slice(0, 200)}`)
        return finish(undefined, serverInfo)
      }
    })
    child.once("error", (error) => finish(`MCP server could not start: ${error.message}`))
    child.once("exit", (code, signal) => finish(`MCP server exited with ${code ?? signal} before answering initialize`))
    child.stdin.on("error", () => {})
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smthrs-release-smoke", version: "1" } }
    })}\n`)
  })

const isEffectFamily = (name) => name === "effect" || name.startsWith("@effect/")

/**
 * Every `effect` and `@effect/*` package installed under `root`'s
 * node_modules, whatever the layout: npm's nested trees, pnpm's `.pnpm`
 * store and Bun's flat one. Each physical copy is reported once.
 */
export const installedEffectFamily = (root) => {
  const found = new Map()
  const seen = new Set()
  const visit = (modules) => {
    let real
    try { real = realpathSync(modules) } catch { return }
    if (seen.has(real)) return
    seen.add(real)
    let entries
    try { entries = readdirSync(modules, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name === ".bin") continue
      const path = join(modules, entry.name)
      if (entry.name === ".pnpm") {
        for (const store of readdirSync(path, { withFileTypes: true })) {
          if (store.isDirectory()) visit(join(path, store.name, "node_modules"))
        }
      } else if (entry.name.startsWith("@")) {
        for (const scoped of readdirSync(path)) packageAt(join(path, scoped))
      } else {
        packageAt(path)
      }
    }
  }
  const packageAt = (directory) => {
    let manifest
    let real
    try {
      real = realpathSync(directory)
      manifest = JSON.parse(readFileSync(join(real, "package.json"), "utf8"))
    } catch { return }
    if (isEffectFamily(manifest.name ?? "") && !found.has(real)) {
      found.set(real, {
        name: manifest.name,
        version: manifest.version,
        path: real,
        // What this package itself asks of `effect`; `effect` asks nothing.
        effectPeer: manifest.peerDependencies?.effect
      })
    }
    visit(join(real, "node_modules"))
  }
  visit(join(root, "node_modules"))
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.path.localeCompare(b.path))
}

/**
 * Fails unless `root` resolved `effect` at `version` alone and every Effect
 * adapter it resolved accepts that release through its own `effect` peer.
 *
 * This is the rule for an application that picked its own Effect inside the
 * supported range. Its adapters need not share one version: a Smithers package
 * installs an adapter at the tested release, and that adapter peers `effect`
 * from its own version up, so it is correct beside any later Effect. An adapter
 * newer than the Effect it runs on is the #2398 failure, and its peer says so.
 * An adapter that states no `effect` peer cannot be shown to accept anything.
 */
export const assertEffectFamilyAccepts = (root, version) => {
  const installed = installedEffectFamily(root)
  if (!installed.some(({ name }) => name === "effect")) throw new Error(`${root}: no installed effect package`)
  const wrong = installed.filter((entry) =>
    entry.name === "effect"
      ? entry.version !== version
      : entry.effectPeer === undefined || !satisfies(version, entry.effectPeer)
  )
  if (wrong.length > 0) {
    throw new Error(`Consumer resolved Effect-family packages that do not accept effect@${version}:\n` +
      wrong.map(({ name, version: found, effectPeer, path }) =>
        `  ${name}@${found}${name === "effect" ? "" : ` (peer effect ${effectPeer ?? "undeclared"})`} at ${path}`).join("\n"))
  }
  return installed
}

/**
 * Fails unless `root` resolved at least one `effect` and every Effect-family
 * package it resolved is exactly `version`.
 */
export const assertEffectFamilyInstalled = (root, version) => {
  const installed = installedEffectFamily(root)
  if (!installed.some(({ name }) => name === "effect")) throw new Error(`${root}: no installed effect package`)
  const wrong = installed.filter((entry) => entry.version !== version)
  if (wrong.length > 0) {
    throw new Error(`Consumer resolved Effect-family packages off ${version}:\n` +
      wrong.map(({ name, version: found, path }) => `  ${name}@${found} at ${path}`).join("\n"))
  }
  return installed
}
