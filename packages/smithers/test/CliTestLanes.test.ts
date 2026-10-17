import { execFileSync } from "node:child_process"
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

it("schedules every CLI test file once without leaving the remainder on one worker", () => {
  // Read the declared target, then ask the real runner what each invocation selects.
  const shell = JSON.parse(execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    "import { Package } from \"./PACKAGE.ts\"; import { metadata } from \"@smthrs/targets/Target\"; console.log(JSON.stringify(metadata(Package.test).attrs.shell))"
  ], { cwd, encoding: "utf8", timeout: 15_000 })) as string
  const commands = [...shell.matchAll(/pnpm exec vitest run ([^;&}]+)/g)]
    .map((match) => match[1]!.trim().split(/\s+/))
    .filter((args) => !args.some((arg) => arg.startsWith("--merge-reports=")))
    .map((args) => args.filter((arg) => !/^--(?:outputFile|reporter|coverage\.)/.test(arg)))
  const all = list(["--exclude", "test/DelegatedLogin.integration.test.ts"])
  const selections = commands.map(list)
  expect(selections.flat().sort()).toEqual(all.sort())
  expect(Math.max(...selections.map((files) => files.length))).toBeLessThanOrEqual(Math.ceil(all.length / 4))
})
