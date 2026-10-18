import * as Fs from "node:fs/promises"
import * as Os from "node:os"
import * as NodePath from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { whoOwns } from "../examples/who-owns.ts"
import { write } from "./helpers/WriteFile.ts"

const temporaryDirectories: Array<string> = []
afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => Fs.rm(directory, { recursive: true, force: true })))
})

const workspace = async (): Promise<string> => {
  const root = await Fs.realpath(await Fs.mkdtemp(NodePath.join(Os.tmpdir(), "smthrs-example-")))
  temporaryDirectories.push(root)
  await write(root, "package.json", `{ "name": "example", "private": true }\n`)
  await write(root, "yarn.lock", "")
  await write(
    root,
    "WORKSPACE.ts",
    `import { Smithers as S } from "@smthrs/targets"
const packageJson = S.file("//package.json")
export const Workspace = S.Workspace("example", {
  repository: "git+https://example.invalid/example.git",
  cache: S.Cache({ directory: ".flows" }),
  runtime: S.Runtime.Node({ version: "26" }),
  packageManager: S.PackageManager.Yarn({ manifest: packageJson, lockfile: S.file("//yarn.lock") }),
  nodeModules: S.Npm.NodeModules({ packageJson }),
  owners: { owners: ["team:platform"] },
  teams: S.Teams({ platform: ["will"] }),
})
`
  )
  await write(
    root,
    "PACKAGE.ts",
    `import { Smithers as S } from "@smthrs/targets"
export const Package = S.Package({ targets: {} })
`
  )
  await write(
    root,
    "api/PACKAGE.ts",
    `import { Smithers as S } from "@smthrs/targets"
export const Package = S.Package({ owners: { owners: ["ada"], noparent: true }, targets: {} })
`
  )
  await write(root, "api/server.ts", "export {}\n")
  await write(root, "README.md", "# example\n")
  return root
}

describe("examples", () => {
  it("who-owns reads each path's package and approvers through the embedded CLI", async () => {
    const root = await workspace()
    expect(await whoOwns(root, ["api/server.ts", "README.md"])).toEqual([
      { path: "README.md", package: "//", approvers: ["team:platform"] },
      { path: "api/server.ts", package: "//api", approvers: ["ada"] }
    ])
  })

  it("who-owns rejects with the CLI's diagnostic when a path leaves the workspace", async () => {
    const root = await workspace()
    await expect(whoOwns(root, ["../outside.ts"])).rejects.toThrow(/workspace-relative/)
  })
})
