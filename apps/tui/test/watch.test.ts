import { expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as FlowControl from "../src/flow-control.ts"
import * as Host from "../src/host.ts"
import * as Log from "../src/log.ts"
import * as Watch from "../src/watch.ts"

const authored = (description: string) =>
  `import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("echo", {
  description: "${description}", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {}, success: Schema.String, body: () => Node.succeed("done")
})\n`
const quiet = () => new Promise((resolve) => setTimeout(resolve, 600))

const observed = (file: string) => {
  const receipts: string[] = []
  let notify: (() => void) | undefined
  return {
    receipts,
    refresh: () => {
      receipts.push(existsSync(file) ? readFileSync(file, "utf8") : "missing")
      notify?.()
    },
    wait: async (expected: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await new Promise<void>((resolve, reject) => {
          const check = () => {
            if (receipts.includes(expected)) resolve()
          }
          notify = check
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `No flow refresh for ${
                    expected.match(/description: "([^"]+)"/)?.[1] ?? expected.slice(0, 80)
                  } within 5 seconds`
                )
              ),
            5_000
          )
          check()
        })
      } finally {
        clearTimeout(timer)
        notify = undefined
      }
    }
  }
}

for (const existing of [false, true]) {
  it(
    `refreshes an immediate canonical flow change with ${existing ? "an existing" : "a new"} flows directory`,
    async () => {
      const cwd = mkdtempSync(join(tmpdir(), "tui-watch-startup-"))
      const folder = join(cwd, "flows", "echo")
      const file = join(folder, "flow.ts")
      if (existing) {
        mkdirSync(folder, { recursive: true })
        writeFileSync(file, authored("Original"))
      }
      const seen = observed(file)
      const watcher = Watch.flows(cwd, seen.refresh, 100)
      try {
        // No sleep or notification warmup: a user can edit as soon as flows()
        // returns, including before the OS has armed its recursive subscription.
        if (!existing) mkdirSync(folder, { recursive: true })
        const expected = authored("Immediate latest revision")
        writeFileSync(file, expected)
        await seen.wait(expected)
        expect(readFileSync(file, "utf8")).toBe(expected)
        await quiet()
        // Setup reconciliation and later native hints can cross debounce windows.
        // Each must read the same authoritative final revision, never roll back.
        expect(seen.receipts.at(-1)).toBe(expected)
        expect(seen.receipts).not.toContain(authored("Original"))
      } finally {
        watcher.dispose()
        rmSync(cwd, { recursive: true, force: true })
      }
    },
    10_000
  )
}

it("coalesces a rapid edit burst into one refresh of its final contents", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-burst-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Before"))
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    const ready = authored("First requested refresh")
    writeFileSync(file, ready)
    await seen.wait(ready)
    await quiet()
    seen.receipts.length = 0
    for (let n = 0; n < 20; n++) writeFileSync(file, authored(`Burst ${n}`))
    const expected = authored("Burst 19")
    await seen.wait(expected)
    await quiet()
    expect(seen.receipts).toEqual([expected])
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
}, 15_000)

for (const existing of [false, true]) {
  it(`refreshes removal and recreation with ${existing ? "existing" : "late-created"} flows`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tui-watch-recreation-"))
    const folder = join(cwd, "flows", "echo")
    const file = join(folder, "flow.ts")
    if (existing) {
      mkdirSync(folder, { recursive: true })
      writeFileSync(file, authored("Before"))
    }
    const seen = observed(file)
    const watcher = Watch.flows(cwd, seen.refresh, 100)
    try {
      if (!existing) mkdirSync(folder, { recursive: true })
      writeFileSync(file, authored("Ready"))
      await seen.wait(authored("Ready"))
      rmSync(join(cwd, "flows"), { recursive: true, force: true })
      await seen.wait("missing")
      mkdirSync(folder, { recursive: true })
      writeFileSync(file, authored("Recreated"))
      await seen.wait(authored("Recreated"))
      writeFileSync(file, authored("Edited after recreation"))
      await seen.wait(authored("Edited after recreation"))
      expect(readFileSync(file, "utf8")).toBe(authored("Edited after recreation"))
    } finally {
      watcher.dispose()
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 25_000)
}

it("disposal after an active refresh suppresses an unpublished edit and later changes", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-dispose-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Before"))
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    writeFileSync(file, authored("Active refresh"))
    await seen.wait(authored("Active refresh"))
    await quiet()
    seen.receipts.length = 0
    writeFileSync(file, authored("Cancelled pending refresh"))
    watcher.dispose()
    watcher.dispose()
    writeFileSync(file, authored("After disposal"))
    await quiet()
    expect(seen.receipts).toEqual([])
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
})

it("ignores unrelated repository trees while continuing to observe flow changes", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-filter-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Before"))
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    writeFileSync(file, authored("Active refresh"))
    await seen.wait(authored("Active refresh"))
    await quiet()
    seen.receipts.length = 0
    const unrelated = join(cwd, "node_modules", "unrelated", "flows", "echo")
    mkdirSync(unrelated, { recursive: true })
    for (let n = 0; n < 10; n++) writeFileSync(join(unrelated, `ignored-${n}.ts`), authored(`Unrelated ${n}`))
    writeFileSync(join(cwd, "README.md"), "Unrelated repository edit")
    await quiet()
    expect(seen.receipts).toEqual([])
    writeFileSync(file, authored("Observed after unrelated edits"))
    await seen.wait(authored("Observed after unrelated edits"))
    expect(readFileSync(file, "utf8")).toBe(authored("Observed after unrelated edits"))
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
}, 15_000)

it("immediate disposal prevents setup reconciliation and later callbacks", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-close-startup-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Before"))
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    writeFileSync(file, authored("Mutation before watcher ready"))
    watcher.dispose()
    watcher.dispose()
    writeFileSync(file, authored("After immediate disposal"))
    await quiet()
    expect(seen.receipts).toEqual([])
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
})

it("invalidates a transient flow observed by public discovery before its directory is retired", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-discovered-transient-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  const host = Host.make({ cwd, environment: {}, approvals: "all" })
  const port = FlowControl.make({ cwd, environment: {}, approvals: host.approvals! })
  const seen = observed(file)
  let watcher: Watch.Watcher | undefined
  try {
    // Warm the actual registry parser before subscribing, so a later discovery
    // can observe an entry while native normalization is still in progress.
    expect((await port.discover()).some((flow) => flow.name === "echo")).toBe(false)
    watcher = Watch.flows(cwd, seen.refresh, 100)
    await seen.wait("missing")
    seen.receipts.length = 0
    mkdirSync(folder, { recursive: true })
    writeFileSync(file, authored("Transient public descriptor"))
    expect(await port.discover()).toContainEqual(
      expect.objectContaining({ name: "echo", description: "Transient public descriptor" })
    )
    rmSync(join(cwd, "flows"), { recursive: true, force: true })
    await seen.wait("missing")
    expect((await port.discover()).some((flow) => flow.name === "echo")).toBe(false)
  } finally {
    watcher?.dispose()
    await port.dispose()
    await host.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
}, 30_000)

it("continues refreshing settled flow edits after concurrent directory churn", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-churn-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Before churn"))
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  const log = Log.path()
  const logOffset = existsSync(log) ? readFileSync(log, "utf8").length : 0
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    await seen.wait(authored("Before churn"))
    // A separate process mutates real descendants while the native subscription
    // enumerates them. Await its completion, not a guessed filesystem delay.
    const mutator = Bun.spawn([
      process.execPath,
      "-e",
      `
      const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
      const { join } = require("node:path");
      const root = ${JSON.stringify(join(cwd, "flows", "churn"))};
      for (let round = 0; round < 200; round++) {
        for (let n = 0; n < 32; n++) {
          const directory = join(root, "branch-" + n, "nested");
          mkdirSync(directory, { recursive: true });
          writeFileSync(join(directory, "metadata.txt"), String(round));
        }
        rmSync(root, { recursive: true, force: true });
      }
    `
    ], { stdout: "pipe", stderr: "pipe" })
    child = mutator
    const status = await mutator.exited
    expect(status, await new Response(mutator.stderr).text()).toBe(0)
    const settled = authored("Settled after churn")
    writeFileSync(file, settled)
    await seen.wait(settled)
    expect(readFileSync(file, "utf8")).toBe(settled)
    const later = authored("Later independent edit")
    writeFileSync(file, later)
    await seen.wait(later)
    expect(seen.receipts.at(-1)).toBe(later)
  } catch (error) {
    const diagnostics = existsSync(log) ? readFileSync(log, "utf8").slice(logOffset) : "No native diagnostic"
    throw new Error(`${error}\n${diagnostics}`, { cause: error })
  } finally {
    child?.kill()
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
}, 30_000)

for (const linkedRoot of [true, false]) {
  it(`refreshes canonical flows through a confined ${linkedRoot ? "root" : "nested"} directory symlink`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tui-watch-confined-link-"))
    const target = join(cwd, "catalog", "echo")
    const file = join(target, "flow.ts")
    mkdirSync(target, { recursive: true })
    writeFileSync(file, authored("Before linked edit"))
    if (linkedRoot) symlinkSync(join(cwd, "catalog"), join(cwd, "flows"), "dir")
    else {
      mkdirSync(join(cwd, "flows"))
      symlinkSync(target, join(cwd, "flows", "echo"), "dir")
    }
    const host = Host.make({ cwd, environment: {}, approvals: "all" })
    const port = FlowControl.make({ cwd, environment: {}, approvals: host.approvals! })
    const seen = observed(file)
    const watcher = Watch.flows(cwd, seen.refresh, 100)
    try {
      expect(await port.discover()).toContainEqual(
        expect.objectContaining({ name: "echo", description: "Before linked edit" })
      )
      await seen.wait(authored("Before linked edit"))
      writeFileSync(file, authored("After linked edit"))
      await seen.wait(authored("After linked edit"))
      expect(await port.discover()).toContainEqual(
        expect.objectContaining({ name: "echo", description: "After linked edit" })
      )
      rmSync(target, { recursive: true, force: true })
      await seen.wait("missing")
      mkdirSync(target, { recursive: true })
      writeFileSync(file, authored("Recreated linked target"))
      await seen.wait(authored("Recreated linked target"))
      watcher.dispose()
      seen.receipts.length = 0
      writeFileSync(file, authored("After linked disposal"))
      await quiet()
      expect(seen.receipts).toEqual([])
    } finally {
      watcher.dispose()
      await port.dispose()
      await host.dispose()
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 30_000)
}

it("refreshes allowed external symlink edits and bounds cycles alongside ordinary flows", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-link-confinement-"))
  const outside = mkdtempSync(join(tmpdir(), "tui-watch-outside-"))
  const folder = join(cwd, "flows", "echo")
  const file = join(folder, "flow.ts")
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, authored("Confined legitimate flow"))
  writeFileSync(join(outside, "flow.ts"), authored("Outside escaped flow"))
  symlinkSync(outside, join(cwd, "flows", "escaped"), "dir")
  symlinkSync(join(cwd, "flows"), join(cwd, "flows", "cycle"), "dir")
  const host = Host.make({ cwd, environment: {}, approvals: "all" })
  const port = FlowControl.make({ cwd, environment: {}, approvals: host.approvals! })
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    const discovered = await port.discover()
    expect(discovered.filter((flow) => flow.name === "echo")).toHaveLength(1)
    // Ordinary project discovery permits external symlinks. Live refresh must
    // follow that same public contract without duplicating cyclic entries.
    expect(discovered).toContainEqual(expect.objectContaining({ description: "Outside escaped flow" }))
    expect(discovered.filter((flow) => flow.description === "Confined legitimate flow")).toHaveLength(1)
    await seen.wait(authored("Confined legitimate flow"))
    await quiet()
    seen.receipts.length = 0
    writeFileSync(join(outside, "flow.ts"), authored("Allowed external edit"))
    await seen.wait(authored("Confined legitimate flow"))
    expect(await port.discover()).toContainEqual(expect.objectContaining({ description: "Allowed external edit" }))
    writeFileSync(file, authored("Legitimate edit after rejected links"))
    await seen.wait(authored("Legitimate edit after rejected links"))
    expect(await port.discover()).toContainEqual(
      expect.objectContaining({ name: "echo", description: "Legitimate edit after rejected links" })
    )
  } finally {
    watcher.dispose()
    await port.dispose()
    await host.dispose()
    rmSync(cwd, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}, 30_000)

it("recovers a confined dangling flow link when its target becomes available", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-dangling-link-"))
  const target = join(cwd, "catalog")
  const file = join(target, "echo", "flow.ts")
  symlinkSync(target, join(cwd, "flows"), "dir")
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait("missing")
    mkdirSync(join(target, "echo"), { recursive: true })
    writeFileSync(file, authored("Recovered dangling linked flow"))
    await seen.wait(authored("Recovered dangling linked flow"))
    expect(readFileSync(file, "utf8")).toBe(authored("Recovered dangling linked flow"))
    writeFileSync(file, authored("Later edit after dangling recovery"))
    await seen.wait(authored("Later edit after dangling recovery"))
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
}, 15_000)

it("follows a relinked flow across physical parents and releases the retired target", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-relink-"))
  const first = mkdtempSync(join(tmpdir(), "tui-watch-first-parent-"))
  const second = mkdtempSync(join(tmpdir(), "tui-watch-second-parent-"))
  const folder = join(cwd, "flows")
  const link = join(folder, "echo")
  mkdirSync(folder)
  for (const parent of [first, second]) mkdirSync(join(parent, "echo"))
  writeFileSync(join(first, "echo", "flow.ts"), authored("First linked parent"))
  writeFileSync(join(second, "echo", "flow.ts"), authored("Second linked parent"))
  symlinkSync(join(first, "echo"), link, "dir")
  const seen = observed(join(link, "flow.ts"))
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(authored("First linked parent"))
    rmSync(link)
    await seen.wait("missing")
    symlinkSync(join(second, "echo"), link, "dir")
    await seen.wait(authored("Second linked parent"))
    await quiet()
    seen.receipts.length = 0
    writeFileSync(join(first, "echo", "flow.ts"), authored("Retired parent edit"))
    await quiet()
    expect(seen.receipts).toEqual([])
    writeFileSync(join(second, "echo", "flow.ts"), authored("Active second parent edit"))
    await seen.wait(authored("Active second parent edit"))
    expect(readFileSync(join(link, "flow.ts"), "utf8")).toBe(authored("Active second parent edit"))
  } finally {
    watcher.dispose()
    for (const directory of [cwd, first, second]) rmSync(directory, { recursive: true, force: true })
  }
}, 25_000)

it("retains a shared target parent until its last flow link is removed", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-shared-anchor-"))
  const outside = mkdtempSync(join(tmpdir(), "tui-watch-shared-parent-"))
  mkdirSync(join(cwd, "flows"))
  for (const name of ["echo", "helper"]) {
    mkdirSync(join(outside, name))
    writeFileSync(
      join(outside, name, "flow.ts"),
      authored(`Shared ${name}`).replace("Flow.make(\"echo\"", `Flow.make("${name}"`)
    )
    symlinkSync(join(outside, name), join(cwd, "flows", name), "dir")
  }
  const file = join(cwd, "flows", "helper", "flow.ts")
  const before = readFileSync(file, "utf8")
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(before)
    rmSync(join(cwd, "flows", "echo"))
    await quiet()
    seen.receipts.length = 0
    rmSync(join(outside, "helper"), { recursive: true, force: true })
    await seen.wait("missing")
    mkdirSync(join(outside, "helper"))
    const restored = authored("Remaining shared linked flow").replace("Flow.make(\"echo\"", "Flow.make(\"helper\"")
    writeFileSync(join(outside, "helper", "flow.ts"), restored)
    await seen.wait(restored)
    seen.receipts.length = 0
    rmSync(join(cwd, "flows", "helper"))
    await seen.wait("missing")
    await quiet()
    seen.receipts.length = 0
    writeFileSync(join(outside, "helper", "flow.ts"), authored("Unsubscribed physical target"))
    await quiet()
    expect(seen.receipts).toEqual([])
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}, 25_000)

it("recovers a relinked target nested beneath a retired physical parent", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-ancestry-"))
  const first = mkdtempSync(join(tmpdir(), "tui-watch-retired-ancestor-"))
  const second = mkdtempSync(join(tmpdir(), "tui-watch-other-ancestor-"))
  const link = join(cwd, "flows", "echo")
  mkdirSync(join(cwd, "flows"))
  const targets = [join(first, "echo"), join(second, "echo"), join(first, "child", "echo")]
  for (const [index, target] of targets.entries()) {
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, "flow.ts"), authored(`Linked ancestry ${index}`))
  }
  symlinkSync(targets[0]!, link, "dir")
  const seen = observed(join(link, "flow.ts"))
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(authored("Linked ancestry 0"))
    for (const index of [1, 2]) {
      rmSync(link)
      symlinkSync(targets[index]!, link, "dir")
      await seen.wait(authored(`Linked ancestry ${index}`))
    }
    seen.receipts.length = 0
    rmSync(targets[2]!, { recursive: true, force: true })
    await seen.wait("missing")
    mkdirSync(targets[2]!, { recursive: true })
    writeFileSync(join(targets[2]!, "flow.ts"), authored("Recovered under retired ancestor"))
    await seen.wait(authored("Recovered under retired ancestor"))
    writeFileSync(join(targets[2]!, "flow.ts"), authored("Later retired ancestor edit"))
    await seen.wait(authored("Later retired ancestor edit"))
    expect(readFileSync(join(link, "flow.ts"), "utf8")).toBe(authored("Later retired ancestor edit"))
  } finally {
    watcher.dispose()
    for (const directory of [cwd, first, second]) rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)

it("recovers a relative nested link resolved through a linked physical root", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-relative-root-"))
  const physical = mkdtempSync(join(tmpdir(), "tui-watch-physical-root-"))
  const catalog = join(physical, "catalog")
  const target = join(physical, "targets", "echo")
  mkdirSync(catalog)
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, "flow.ts"), authored("Relative physical root"))
  symlinkSync("../targets/echo", join(catalog, "echo"), "dir")
  symlinkSync(catalog, join(cwd, "flows"), "dir")
  const file = join(cwd, "flows", "echo", "flow.ts")
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(authored("Relative physical root"))
    rmSync(target, { recursive: true, force: true })
    await seen.wait("missing")
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, "flow.ts"), authored("Recovered relative physical root"))
    await seen.wait(authored("Recovered relative physical root"))
    writeFileSync(join(target, "flow.ts"), authored("Later relative root edit"))
    await seen.wait(authored("Later relative root edit"))
    expect(readFileSync(file, "utf8")).toBe(authored("Later relative root edit"))
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
    rmSync(physical, { recursive: true, force: true })
  }
}, 25_000)

it("recovers a flow target reached through a chain of directory links", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-link-chain-"))
  const physical = mkdtempSync(join(tmpdir(), "tui-watch-chain-target-"))
  const target = join(physical, "echo")
  mkdirSync(target)
  mkdirSync(join(cwd, "flows"))
  symlinkSync(physical, join(cwd, "catalog-link"), "dir")
  symlinkSync("../catalog-link/echo", join(cwd, "flows", "echo"), "dir")
  writeFileSync(join(target, "flow.ts"), authored("Chained target before"))
  const file = join(cwd, "flows", "echo", "flow.ts")
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(authored("Chained target before"))
    rmSync(target, { recursive: true, force: true })
    await seen.wait("missing")
    mkdirSync(target)
    writeFileSync(join(target, "flow.ts"), authored("Recovered chained target"))
    await seen.wait(authored("Recovered chained target"))
    writeFileSync(join(target, "flow.ts"), authored("Later chained edit"))
    await seen.wait(authored("Later chained edit"))
    expect(readFileSync(file, "utf8")).toBe(authored("Later chained edit"))
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
    rmSync(physical, { recursive: true, force: true })
  }
}, 25_000)

it("recovers a physical leaf behind a final-component chain of links", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "tui-watch-leaf-chain-"))
  const physical = mkdtempSync(join(tmpdir(), "tui-watch-leaf-target-"))
  const target = join(physical, "echo")
  mkdirSync(target)
  mkdirSync(join(cwd, "flows"))
  symlinkSync(target, join(cwd, "alias-link"), "dir")
  symlinkSync("../alias-link", join(cwd, "flows", "echo"), "dir")
  writeFileSync(join(target, "flow.ts"), authored("Leaf chain before"))
  const file = join(cwd, "flows", "echo", "flow.ts")
  const seen = observed(file)
  const watcher = Watch.flows(cwd, seen.refresh, 100)
  try {
    await seen.wait(authored("Leaf chain before"))
    rmSync(target, { recursive: true, force: true })
    await seen.wait("missing")
    mkdirSync(target)
    writeFileSync(join(target, "flow.ts"), authored("Recovered chained physical leaf"))
    await seen.wait(authored("Recovered chained physical leaf"))
    writeFileSync(join(target, "flow.ts"), authored("Later chained physical leaf edit"))
    await seen.wait(authored("Later chained physical leaf edit"))
    expect(readFileSync(file, "utf8")).toBe(authored("Later chained physical leaf edit"))
  } finally {
    watcher.dispose()
    rmSync(cwd, { recursive: true, force: true })
    rmSync(physical, { recursive: true, force: true })
  }
}, 25_000)
