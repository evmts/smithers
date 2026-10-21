import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"

const cwd = join(import.meta.dirname, "..")
const list = (args: Array<string>): Array<string> => {
  // `vitest list --filesOnly` omits sharding. Use the runner's discovery and
  // configured sequencer, exactly as its execution pool selects files.
  const output = execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { createVitest, parseCLI } from "vitest/node";
const { filter, options } = parseCLI(["vitest", ...JSON.parse(process.argv[1])]);
const ctx = await createVitest("test", { ...options, run: true, coverage: { enabled: false } });
try {
  const files = await ctx.globTestSpecifications(filter);
  const selected = ctx.config.shard ? await new ctx.config.sequence.sequencer(ctx).shard(files) : files;
  console.log(JSON.stringify(selected.map((file) => file.moduleId)));
} finally { await ctx.close(); }`,
    JSON.stringify(args)
  ], { cwd, encoding: "utf8", timeout: 15_000 })
  return JSON.parse(output) as Array<string>
}

const declaredShell = () =>
  JSON.parse(execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import { Package } from \"./PACKAGE.ts\"; import { metadata } from \"@smthrs/targets/Target\"; console.log(JSON.stringify(metadata(Package.test).attrs.shell))"
  ], { cwd, encoding: "utf8", timeout: 15_000 })) as string

it("schedules every CLI test file once without leaving the remainder on one worker", () => {
  // Read the declared target, then ask the real runner what each invocation selects.
  const shell = declaredShell()
  const commands = [...shell.matchAll(/pnpm exec vitest run ([^;"&}]+)/g)]
    .map((match) => match[1]!.trim().split(/\s+/))
    .filter((args) => !args.some((arg) => arg.startsWith("--merge-reports=")))
    .map((args) => args.filter((arg) => !/^--(?:outputFile|reporter|coverage\.)/.test(arg)))
  // A CLI `--exclude` replaces the config's exclude list, as it does for the
  // remainder shards, so the full selection is taken the same way.
  const all = list(["--exclude", "**/node_modules/**"])
  const selections = commands.map(list)
  expect(selections.flat().sort()).toEqual(all.sort())
  expect(Math.max(...selections.map((files) => files.length))).toBeLessThanOrEqual(Math.ceil(all.length / 4))
})

it.skipIf(process.platform === "win32")(
  "starts another shard while earlier groups are blocked, then merges all results",
  () => {
    const root = mkdtempSync(join(tmpdir(), "smithers-cli-lanes-"))
    try {
      symlinkSync(join(cwd, "node_modules"), join(root, "node_modules"), "dir")
      writeFileSync(join(root, "package.json"), "{\"type\":\"module\"}")
      writeFileSync(
        join(root, "vitest.config.mjs"),
        "export default { test: { include: [\"*.test.mjs\"], testTimeout: 12000, coverage: { enabled: false } } }"
      )
      const shell = declaredShell()
        .replace("cd packages/smithers && ", "")
        .replaceAll("vitest.config.ts", "vitest.config.mjs")
        .replace(/pnpm exec vitest run ([^;"&}]+)/g, (command, args: string) => {
          if (args.includes("--merge-reports=")) return command
          const phase = /--outputFile=\$blobs\/([a-z-]+)\.json/.exec(args)![1]!
          // Real Vitest processes: the first three wait for the second remainder
          // shard. A fixed handoff leaves that shard behind a blocked group.
          writeFileSync(
            join(root, `${phase}.test.mjs`),
            `
import { it, expect } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
it(${JSON.stringify(phase)}, async () => {
  writeFileSync(${JSON.stringify(join(root, phase))}, "started");
  if (${phase.endsWith("-fixed")}) {
    const deadline = Date.now() + 8000;
    while (!existsSync(${JSON.stringify(join(root, "two"))}) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(existsSync(${JSON.stringify(join(root, "two"))})).toBe(true);
  }
});`
          )
          return `pnpm exec vitest run --config vitest.config.mjs --reporter=blob --outputFile=$blobs/${phase}.json ${phase}.test.mjs `
        })
      execFileSync("sh", ["-c", shell], { cwd: root, encoding: "utf8", timeout: 25_000 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
