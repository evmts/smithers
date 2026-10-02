import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { it } from "vitest"
import { materializeFlowTemplate } from "./faults/materializeFlowTemplate.ts"

const root = fileURLToPath(new URL("../../../", import.meta.url))
// Real filesystem and TypeScript compiler only: do not import the service-spawning fault harness.
it(
  "materialized fault flows preserve source and owning closure bytes and typecheck as actual public Flows",
  () => {
    const cli = path.join(root, "packages/smithers")
    const fixture = path.join(cli, "test/faults/fixtures")
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "sol-fault-materialization-"))
    try {
      fs.cpSync(path.join(fixture, "burndown"), tmp, { recursive: true })
      fs.cpSync(path.join(fixture, "disk-flow"), path.join(tmp, "flows/disk"), { recursive: true })
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }))
      fs.mkdirSync(path.join(tmp, "node_modules"))
      for (const name of fs.readdirSync(path.join(cli, "node_modules")).filter((name) => !name.startsWith("."))) {
        fs.symlinkSync(path.join(cli, "node_modules", name), path.join(tmp, "node_modules", name), "dir")
      }
      if (!fs.existsSync(path.join(tmp, "node_modules/microsandbox"))) {
        fs.symlinkSync(
          path.join(root, "flows/node_modules/microsandbox"),
          path.join(tmp, "node_modules/microsandbox"),
          "dir"
        )
      }
      for (const tag of ["burndown", "live", "reuse", "disk"]) {
        const dir = path.join(tmp, "flows", tag)
        const source = fs.readFileSync(path.join(dir, "flow.ts.template"))
        materializeFlowTemplate(dir)
        assert.deepEqual(fs.readFileSync(path.join(dir, "flow.ts")), source, `${tag}: exact source bytes`)
        assert.equal(fs.existsSync(path.join(dir, "flow.ts.template")), false, `${tag}: one executable source`)
        assert(source.toString().includes(`export default Flow.make("${tag}"`), `${tag}: literal public Flow tag`)
      }
      for (
        const [tag, names] of [["burndown", ["host.ts"]], ["disk", [
          "vm.ts",
          "vm-pool.ts",
          "vm-options.ts",
          "msb-nice.sh"
        ]]] as const
      ) {
        for (const name of names) {
          const original = fs.readFileSync(path.join(root, "flows/issue-sweep", name))
          const destination = path.join(tmp, "flows", tag, name)
          fs.copyFileSync(path.join(root, "flows/issue-sweep", name), destination)
          assert.deepEqual(fs.readFileSync(destination), original, `owning ${name}: complete unchanged bytes`)
        }
      }
      const configPath = path.join(cli, "tsconfig.test.json")
      const config = ts.readConfigFile(configPath, ts.sys.readFile)
      assert.equal(config.error, undefined)
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, cli)
      assert.deepEqual(parsed.errors, [])
      const options = { ...parsed.options, rootDir: tmp, outDir: path.join(tmp, "unused-output"), noEmit: true }
      const program = ts.createProgram(
        ["burndown", "live", "reuse", "disk"].map((tag) => path.join(tmp, "flows", tag, "flow.ts")),
        options
      )
      const diagnostics = ts.getPreEmitDiagnostics(program)
      assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), [])
      for (const [tag, name] of [["burndown", "host.ts"], ["disk", "vm.ts"]] as const) {
        const ownerFile = path.join(tmp, "flows", tag, name)
        const bytes = fs.readFileSync(ownerFile)
        fs.unlinkSync(ownerFile)
        const incomplete = ts.createProgram(
          ["burndown", "live", "reuse", "disk"].map((tag) => path.join(tmp, "flows", tag, "flow.ts")),
          options
        )
        assert(
          ts.getPreEmitDiagnostics(incomplete).some((d) =>
            d.code === 2307 && ts.flattenDiagnosticMessageText(d.messageText, "\n").includes(`./${name}`)
          ),
          `${name}: missing actual owner remains a compiler failure`
        )
        fs.writeFileSync(ownerFile, bytes)
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  },
  30_000
)
