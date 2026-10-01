/** Live catalog refresh through the production renderer and canonical file flows. */
import { expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux.ts"

const authored = (description: string) =>
  `import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("echo", {
  description: "${description}", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {}, success: Schema.String, body: () => Node.succeed("done")
})\n`

const app = resolve(import.meta.dir, "..")
const cli = resolve(app, "../../packages/smithers")

/** Relocate the shipped artifact, leaving no checkout-relative native helper. */
function packaged(runtime: "node" | "compiled", cwd: string) {
  const built = runtime === "node"
    ? spawnSync("node", [join(cli, "scripts/build-tui.mjs")], { encoding: "utf8" })
    : spawnSync("bun", [join(cli, "scripts/build-tui-binaries.mjs"), "--single"], { encoding: "utf8" })
  expect(built.status, built.stderr).toBe(0)
  const installation = join(cwd, "installation")
  mkdirSync(installation)
  if (runtime === "compiled") {
    const binary = join(installation, "smithers-tui")
    cpSync(join(cli, `out/tui-binaries/tui-${process.platform}-${process.arch}/bin/smithers-tui`), binary)
    return `env -u SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ${binary} ${cwd}`
  }
  const modules = join(installation, "node_modules")
  mkdirSync(modules)
  for (const name of readdirSync(join(cli, "node_modules"))) {
    if (name.startsWith(".")) continue
    if (name.startsWith("@")) {
      mkdirSync(join(modules, name))
      for (const child of readdirSync(join(cli, "node_modules", name))) {
        if (name === "@smthrs" && (child === "platform-node" || child === "cli")) continue
        symlinkSync(realpathSync(join(cli, "node_modules", name, child)), join(modules, name, child))
      }
    } else symlinkSync(realpathSync(join(cli, "node_modules", name)), join(modules, name))
  }
  const installedCli = join(modules, "@smthrs/cli")
  mkdirSync(installedCli, { recursive: true })
  cpSync(join(cli, "package.json"), join(installedCli, "package.json"))
  cpSync(join(cli, "vendor"), join(installedCli, "vendor"), { recursive: true })
  cpSync(join(cli, "dist/tui"), join(installedCli, "dist/tui"), { recursive: true })
  cpSync(join(cli, "dist/vendor"), join(installedCli, "dist/vendor"), { recursive: true })
  const native = join(modules, "@smthrs/platform-node")
  const bin = join(native, "bin", `${process.platform}-${process.arch}`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(native, "package.json"),
    JSON.stringify({ name: "@smthrs/platform-node", exports: { "./package.json": "./package.json" } })
  )
  cpSync(
    process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ?? resolve(cli, "../../target/release/smithers-jj-export"),
    join(bin, "smithers-jj-export")
  )
  return `env -u SMITHERS_WORKSPACE_JJ_EXPORT_BINARY node --experimental-ffi --disable-warning=ExperimentalWarning ${
    join(installedCli, "dist/tui/main.js")
  } ${cwd}`
}

for (
  const [runtime, existing] of [["source", false], ["source", true], ["node", false], ["compiled", false]] as const
) {
  it(
    `refreshes the open ${runtime} production catalog after ${
      existing ? "editing an existing" : "creating a new"
    } flow directory and recreation`,
    async () => {
      const cwd = mkdtempSync(join(tmpdir(), "tui-watch-production-"))
      const folder = join(cwd, "flows", "echo")
      const file = join(folder, "flow.ts")
      if (existing) {
        mkdirSync(folder, { recursive: true })
        writeFileSync(file, authored("Initial catalog revision"))
      }
      let tui: Tui | undefined
      try {
        tui = await Tui.start({
          cwd,
          cols: 120,
          rows: 30,
          command: runtime === "source" ? `bun ${join(app, "src/main.tsx")} ${cwd}` : packaged(runtime, cwd),
          env: {
            PATH: process.env.PATH ?? "",
            HOME: cwd,
            XDG_CONFIG_HOME: cwd,
            SMITHERS_TUI_SESSION_DIR: join(cwd, "sessions"),
            SMITHERS_TUI_REPLAY: join(app, "test/fixtures/fix-add.jsonl"),
            SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ?? ""
          }
        })
        await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "startup")
        await tui.press("/flows\r")
        await tui.until((screen) => screen.includes("Flows") && screen.includes("esc"), 10_000, "flow picker")
        if (existing) {
          await tui.until((screen) => screen.includes("Initial catalog revision"), 10_000, "initial descriptor")
        } else mkdirSync(folder, { recursive: true })
        // Keep the existing picker open: reopening /flows would refresh manually
        // and could conceal a missed live catalog notification.
        for (let n = 0; n < 10; n++) {
          writeFileSync(file, authored(`Intermediate revision ${n}`))
        }
        writeFileSync(file, authored("Latest live catalog revision"))
        await tui.until(
          (screen) => screen.includes("Latest live catalog revision") && !screen.includes("Initial catalog revision"),
          10_000,
          "live revised descriptor"
        )
        expect(tui.screen()).not.toContain("Intermediate revision")
        rmSync(join(cwd, "flows"), { recursive: true, force: true })
        await tui.until(
          (screen) => screen.includes("Flows") && !screen.includes("Latest live catalog revision"),
          10_000,
          "retired descriptor"
        )
        mkdirSync(folder, { recursive: true })
        writeFileSync(file, authored("Recreated live catalog revision"))
        await tui.until((screen) => screen.includes("Recreated live catalog revision"), 10_000, "recreated descriptor")
        // A supported confined symlink must keep refreshing through the same
        // open picker in every shipped runtime, not only direct source tests.
        rmSync(join(cwd, "flows"), { recursive: true, force: true })
        await tui.until(
          (screen) => screen.includes("Flows") && !screen.includes("Recreated live catalog revision"),
          5_000,
          "retired recreated descriptor"
        )
        const catalog = join(cwd, "catalog", "echo")
        mkdirSync(catalog, { recursive: true })
        writeFileSync(join(catalog, "flow.ts"), authored("Linked live catalog revision"))
        symlinkSync(join(cwd, "catalog"), join(cwd, "flows"), "dir")
        await tui.until((screen) => screen.includes("Linked live catalog revision"), 5_000, "linked descriptor")
        writeFileSync(join(catalog, "flow.ts"), authored("Updated linked catalog revision"))
        await tui.until(
          (screen) => screen.includes("Updated linked catalog revision"),
          5_000,
          "updated linked descriptor"
        )
        await tui.press(key.escape)
        await tui.until(
          (screen) => !screen.includes("Flows") && screen.includes("ctrl+k Search"),
          5_000,
          "composer focus restored"
        )
        await tui.type("draft after live refresh 😀")
        await tui.until(
          (screen) => /┃\s+draft after live refresh 😀/.test(screen),
          5_000,
          "composer usable after live refresh"
        )
      } catch (error) {
        const receipts = process.env.SMITHERS_TEST_RECEIPTS_DIR
        if (receipts !== undefined) {
          mkdirSync(receipts, { recursive: true })
          writeFileSync(
            join(receipts, `watch-catalog-${runtime}-${existing ? "existing" : "late"}.screen.txt`),
            tui?.screen() ?? "No renderer"
          )
          const log = join(cwd, "sessions", "tui.log")
          if (existsSync(log)) {
            writeFileSync(
              join(receipts, `watch-catalog-${runtime}-${existing ? "existing" : "late"}.log`),
              readFileSync(log)
            )
          }
        }
        throw error
      } finally {
        await tui?.stop()
        rmSync(cwd, { recursive: true, force: true })
      }
    },
    120_000
  )
}
