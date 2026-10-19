/**
 * The repository patches no dependency (Will, 2026-10-16: "get rid of
 * patches"). A dependency that misbehaves in our environment is fixed in the
 * environment or upstream, never forked in `patches/`: the dprint patch that
 * worked around a NixOS guest without its ELF loader (#3007) is gone, and the
 * guest's loader is declared in `.smithers/environment.nix` (#4093).
 *
 * The root install still keys on every patch file the workspace definition
 * names, so a reintroduced patch would re-key it; it never needs a hand-kept
 * list (#3089).
 */
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as Input from "../src/Input.ts"

const repositoryRoot = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../../../../..")
const read = (path: string) => Fs.readFile(NodePath.join(repositoryRoot, path), "utf8")

describe("the repository's dependency patches", () => {
  it("are none: neither package manager applies one", async () => {
    expect(await read("pnpm-workspace.yaml")).not.toMatch(/^patchedDependencies:/m)
    expect(JSON.parse(await read("package.json"))).not.toHaveProperty("patchedDependencies")
    expect(await read("pnpm-lock.yaml")).not.toMatch(/^patchedDependencies:/m)
    expect(await read("bun.lock")).not.toContain(`"patchedDependencies"`)
    await expect(Fs.stat(NodePath.join(repositoryRoot, "patches"))).rejects.toMatchObject({ code: "ENOENT" })

    const inputs = await Input.expandPnpmWorkspace(repositoryRoot, "", Input.pnpmWorkspace("//pnpm-workspace.yaml"))
    expect(inputs.filter((input) => input.endsWith(".patch"))).toEqual([])
  })

  it("would come from the workspace definition the root install declares, not a hand-kept list", async () => {
    const declaration = await read("PACKAGE.ts")
    const install = declaration.slice(declaration.indexOf("const nodeModules = Smithers.Install({"))
    const body = install.slice(0, install.indexOf("\n})\n"))
    expect(declaration).toContain(`const workspace = Smithers.pnpmWorkspace("//pnpm-workspace.yaml")`)
    expect(body).toMatch(/\n {2}workspaceManifest: workspace,\n/)
    expect(body).not.toMatch(/\bpatches:/)
  })
})
