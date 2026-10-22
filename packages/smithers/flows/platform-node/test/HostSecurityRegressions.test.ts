import { ProcessLedger } from "@smthrs/kernel"
import { Effect, Layer } from "effect"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as NodeHost from "../src/NodeHost.ts"
import * as Sandbox from "../src/ProcessSandbox.ts"

describe("host authority regressions", () => {
  it.each([NodeHost.layerAt, NodeHost.layerContainedAt])(
    "defers invalid roots to typed layer failure (%#)",
    async (factory) => {
      let layer: ReturnType<typeof factory> | undefined
      expect(() => {
        layer = factory("relative")
      }).not.toThrow()
      const error = await Effect.runPromise(
        Effect.scoped(Layer.build(layer!)).pipe(
          Effect.provide(ProcessLedger.layerMemory({ hostId: "invalid-root", ownerPid: process.pid })),
          Effect.flip
        )
      )
      expect(error).toBeInstanceOf(NodeHost.NodeHostError)
      expect(error).toMatchObject({ code: "invalid_repository_root" })
    }
  )

  const fixture = (run: (root: string, facts: Sandbox.Host) => void) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "host-security-")))
    try {
      run(root, Sandbox.host())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
  const plan = (root: string, facts: Sandbox.Host, request: Partial<Sandbox.Request>) =>
    Sandbox.plan(
      { network: "none", reads: [], writes: [], ...request },
      { workspaceRoot: root, cwd: root, tmp: join(root, ".tmp") },
      facts
    )
  it("does not grant future undeclared children when all current children are declared", () =>
    fixture((root, facts) => {
      mkdirSync(join(root, "src"))
      writeFileSync(join(root, "src/a"), "declared")
      const darwin = { ...facts, platform: "darwin" as const, executable: () => "/usr/bin/sandbox-exec" }
      const result = plan(root, darwin, { reads: ["src/a"] })
      if (Sandbox.isUnenforceable(result)) throw result
      writeFileSync(join(root, "src/future"), "undeclared")
      expect(result.reads).toEqual([join(root, "src/a")])
      expect(Sandbox.seatbelt(result, darwin)).not.toContain(`(subpath "${join(root, "src")}")`)
    }))
  it("does not turn a workspace symlink into explicit credential authority", () =>
    fixture((root, facts) => {
      const workspace = join(root, "workspace")
      const home = join(root, "home")
      mkdirSync(workspace)
      mkdirSync(home)
      mkdirSync(join(home, ".ssh"))
      writeFileSync(join(home, ".ssh/key"), "synthetic")
      symlinkSync(join(home, ".ssh"), join(workspace, "credentials"))
      const result = plan(workspace, { ...facts, home, platform: "linux", executable: () => "/usr/bin/bwrap" }, {
        reads: ["credentials"]
      })
      expect(Sandbox.isUnenforceable(result)).toBe(true)
      const admitted = plan(workspace, { ...facts, home, platform: "linux", executable: () => "/usr/bin/bwrap" }, {
        reads: ["credentials"],
        externalReads: [join(home, ".ssh")]
      })
      if (Sandbox.isUnenforceable(admitted)) throw admitted
      expect(admitted.externalReads).toEqual([join(home, ".ssh")])
    }))
  it("refuses an existing file declared as a directory write", () =>
    fixture((root, facts) => {
      writeFileSync(join(root, "output"), "file")
      expect(Sandbox.isUnenforceable(plan(root, {
        ...facts,
        platform: "linux",
        executable: () => "/usr/bin/bwrap"
      }, { writes: ["output"] }))).toBe(true)
    }))
  it("refuses absent readOnly paths inside writable mounts", () =>
    fixture((root, facts) => {
      mkdirSync(join(root, "out"))
      const linux = { ...facts, platform: "linux" as const, executable: () => "/usr/bin/bwrap" }
      const result = plan(root, linux, { writes: ["out"], readOnly: ["out/closed"] })
      if (!Sandbox.isUnenforceable(result)) expect(() => Sandbox.bubblewrap(result, ["true"], linux)).toThrow()
    }))
  it("refuses Docker loopback networking during selection and rendering", () =>
    fixture((root, facts) => {
      const docker = { ...facts, executable: () => "/usr/bin/docker" }
      const mechanism = { _tag: "docker" as const, image: "fixture" }
      expect(Sandbox.isUnenforceable(plan(root, docker, { mechanism, network: "loopback" }))).toBe(true)
      const result = plan(root, docker, { mechanism })
      if (Sandbox.isUnenforceable(result)) throw result
      expect(() => Sandbox.docker({ ...result, network: "loopback" }, ["true"], {}, docker)).toThrow()
    }))
})
