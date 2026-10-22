// The todo-lint eval's repository and checks, without a model: the repository's own lint fails the TODO's file and
// passes its fix, its typecheck catches a wrong fix, and the eval's readings of commands, writes and time.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { createRequire } from "node:module"
import {
  BUDGET_MS,
  checkedAfterWrite,
  filesOf,
  FIXED,
  FIXED_FILE,
  isTheFix,
  projectedMs,
  RUN_MS,
  shellWrites,
  strayWrite,
  TODO,
  TOOL_MS,
  wideBecause,
  writesOf,
} from "./todoLint.ts"

const FILES = filesOf(true)
const TSC = createRequire(import.meta.url).resolve("typescript/lib/tsc.js")
const roots: Array<string> = []
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

/** The repository written to a scratch folder, `changes` over it, and `script` run in the widgets package. */
const run = (script: "lint" | "check" | "tsc", changes: Readonly<Record<string, string>> = {}) => {
  const root = mkdtempSync(join(tmpdir(), "todo-lint-"))
  roots.push(root)
  for (const [path, contents] of Object.entries({ ...FILES, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), contents)
  }
  const ran = script === "tsc"
    ? spawnSync("node", [TSC, "-p", "packages/widgets"], { cwd: root, encoding: "utf8" })
    : spawnSync("node", [`../../tools/${script}.mjs`, "src"], { cwd: join(root, "packages/widgets"), encoding: "utf8" })
  return { status: ran.status, stdout: ran.stdout }
}


describe("the repository", () => {
  test("its lint fails the TODO's file at the two annotations, and passes the fix", () => {
    const before = run("lint")
    expect(before.status).toBe(1)
    expect(before.stdout).toContain("src/Widget.ts:3:")
    expect(before.stdout).toContain("src/Widget.ts:5:")
    expect(before.stdout).toContain("2 problems")
    expect(run("lint", { [FIXED_FILE]: FIXED })).toEqual({ status: 0, stdout: "" })
    // A dynamic import is not a type annotation.
    expect(run("lint", { [FIXED_FILE]: FIXED, "packages/widgets/src/Lazy.ts": 'export const lazy = () => import("./label.ts").then((m) => m)\n' }).status)
      .toBe(0)
    expect(run("lint", { [FIXED_FILE]: FIXED, "packages/widgets/src/One.ts": 'export type One = import("./Store.ts").Service\n' }).stdout)
      .toContain("1 problem\n")
  })

  test("its typecheck passes the TODO's base and its fix, and fails a fix that names what isn't there", () => {
    expect(run("check").status).toBe(0)
    expect(run("check", { [FIXED_FILE]: FIXED }).status).toBe(0)
    const typo = run("check", { [FIXED_FILE]: FIXED.replace("store: Store.Service", "store: Store.Servic") })
    expect(typo).toEqual({ status: 2, stdout: expect.stringContaining("module './Store.ts' has no exported member 'Servic'") })
    expect(run("check", { [FIXED_FILE]: FIXED.replace('"./Store.ts"', '"./Stor.ts"') }).stdout).toContain("cannot find module './Stor.ts'")
    expect(run("check", { [FIXED_FILE]: FIXED.replace("{ label }", "{ labels }") }).stdout).toContain("no exported member 'labels'")
    expect(run("check", { [FIXED_FILE]: FILES[FIXED_FILE]!.replaceAll(".Service", ".Servic") }).stdout).toContain("'Servic'")
  })

  test("TypeScript compiles the base and the fix, and not a fix that breaks the file; the fix is the TODO's own", () => {
    expect(run("tsc").status).toBe(0)
    expect(run("tsc", { [FIXED_FILE]: FIXED }).status).toBe(0)
    expect(run("tsc", { [FIXED_FILE]: "export const render = (\n" }).status).not.toBe(0)
    expect(isTheFix(FIXED)).toBe(true)
    expect(isTheFix(FIXED.replaceAll("\n", "\n\n").replaceAll("\nexport", "\n  export"))).toBe(true)
    // A change inside a line, even inside a string, is another file.
    expect(isTheFix(FIXED.replace('"none"', '"no ne"'))).toBe(false)
    expect(isTheFix(FILES[FIXED_FILE])).toBe(false)
    expect(isTheFix(undefined)).toBe(false)
  })

  test("without its tools installed, each package's scripts need tsc first, as smithersai/smithers' need eslint and tsc", () => {
    const bare = filesOf(false)
    for (const name of ["widgets", "gadgets"]) {
      const { scripts } = JSON.parse(bare[`packages/${name}/package.json`]!) as { scripts: Record<string, string> }
      expect(scripts.lint).toBe("tsc --noEmit -p . && node ../../tools/lint.mjs src")
      expect(scripts.check).toBe("tsc --noEmit -p . && node ../../tools/check.mjs src")
    }
    expect(Object.keys(bare)).toEqual(Object.keys(FILES))
  })

  test("its declared checks install before they check, as smithersai/smithers' do", () => {
    expect(FILES[".smithers/checks/lint.sh"]).toContain('pnpm install --frozen-lockfile --filter "[$base]..."')
    expect(FILES[".smithers/checks/check.sh"]).toContain('run --if-present check')
    expect(TODO.prompt).toContain("lines 3 and 5")
  })
})

describe("what the eval reads", () => {
  test.each([
    ["pnpm --filter @fixture/widgets run lint", undefined],
    ["cd packages/widgets && pnpm run check", undefined],
    ["node tools/lint.mjs packages/widgets/src", undefined],
    ["pnpm install", "install"],
    ["pnpm i --frozen-lockfile --filter @fixture/widgets...", "install"],
    ["npm ci", "install"],
    ["corepack enable", "install"],
    ["sh .smithers/checks/lint.sh", "declared check script (installs first)"],
    ["git status; ./.smithers/checks/check.sh", "declared check script (installs first)"],
    ["ls -la .smithers/checks/; cat .smithers/checks/lint.sh", undefined],
    ["pnpm -r run lint", "every package"],
    ["npm run lint --workspaces", "every package"],
    ["pnpm --filter @fixture/widgets install", "install"],
    ["pnpm --filter \"*\" run lint", "every package"],
    ["pnpm --filter=... run check", "every package"],
    ["bash -c \"sh .smithers/checks/lint.sh\"", "declared check script (installs first)"],
    ["for f in .smithers/checks/*.sh; do sh \"$f\"; done", "declared check script (installs first)"],
    ["cat .smithers/checks/lint.sh", undefined],
    ["pnpm --filter @fixture/* run lint", "every package"],
    ["ls -r packages", undefined],
  ])("%s is %s", (command, why) => expect(wideBecause(command)).toBe(why))

  test.each([
    ["pnpm --filter @fixture/widgets run lint 2>&1", []],
    ["pnpm run lint > /dev/null && echo ok", []],
    ["node -e 'const f = (x) => x'", []],
    ["cat > .verify.sh <<'EOF'", [".verify.sh"]],
    ["pnpm install >> .t3-pnpm.log 2>&1", [".t3-pnpm.log"]],
    ["echo hi | tee -a /tmp/log.txt", ["/tmp/log.txt"]],
    ["echo hi 1>.verify.sh 2>err.log", [".verify.sh", "err.log"]],
    ["cmd 2>&1 >&2", []],
    ["sed -i 's/a/b/' packages/widgets/src/Widget.ts", ["-i"]],
  ])("%s writes %j", (command, files) => expect(shellWrites(command)).toEqual(files))

  test("the checks that count passed on the package after the last write", () => {
    const lint = { tool: "run", command: "pnpm --filter @fixture/widgets run lint", exitCode: 0 } as const
    const check = { tool: "run", command: "cd packages/widgets && pnpm run check", exitCode: 0 } as const
    const write = { tool: "write", path: FIXED_FILE } as const
    expect(checkedAfterWrite([])).toEqual({ lint: false, check: false })
    expect(checkedAfterWrite([lint, check, write])).toEqual({ lint: false, check: false })
    expect(checkedAfterWrite([lint, write, { tool: "read" }, lint])).toEqual({ lint: true, check: false })
    expect(checkedAfterWrite([write, check, lint])).toEqual({ lint: true, check: true })
    expect(checkedAfterWrite([
      write,
      { tool: "run", command: "node ../../tools/lint.mjs src", cwd: "packages/widgets", exitCode: 0 },
      { tool: "run", command: "tsc --noEmit -p .", cwd: "packages/widgets", exitCode: 0 },
    ])).toEqual({ lint: true, check: true })
    expect(checkedAfterWrite([write, { ...lint, command: `${lint.command} 2>&1` }])).toEqual({ lint: true, check: false })
    // Not each check as its own command on the package: an echo, a swallowed exit, the root's script, two in one.
    for (const command of [
      'echo "pnpm --filter @fixture/widgets run lint"',
      "pnpm --filter @fixture/widgets run lint || true",
      "pnpm run lint",
      "pnpm --filter @fixture/widgets run lint && pnpm --filter @fixture/widgets run check",
    ]) expect(checkedAfterWrite([write, { tool: "run", command, exitCode: 0 }])).toEqual({ lint: false, check: false })
    // Failed, never collected, reading the tools, another package, or before an edit through the shell: none count.
    expect(checkedAfterWrite([write, { ...lint, exitCode: 1 }, { tool: "run", command: check.command }])).toEqual({ lint: false, check: false })
    expect(checkedAfterWrite([write, { tool: "run", command: "cat tools/lint.mjs tools/check.mjs", exitCode: 0 }]))
      .toEqual({ lint: false, check: false })
    expect(checkedAfterWrite([write, { tool: "run", command: "pnpm --filter @fixture/gadgets run lint", exitCode: 0 }]))
      .toEqual({ lint: false, check: false })
    expect(checkedAfterWrite([write, lint, check, { tool: "run", command: "sed -i 's/a/b/' packages/widgets/src/Widget.ts", exitCode: 0 }]))
      .toEqual({ lint: false, check: false })
  })

  test("a write is the TODO's change only at the file it names", () => {
    expect(strayWrite(FIXED_FILE)).toBeUndefined()
    expect(strayWrite(`./${FIXED_FILE}`)).toBeUndefined()
    expect(strayWrite(".t3-verify.sh")).toBe("wrote .t3-verify.sh")
    expect(strayWrite("-i")).toBeUndefined()
    expect(writesOf({ tool: "write", path: "a.sh" })).toEqual(["a.sh"])
    expect(writesOf({ tool: "run", command: "echo > b.log" })).toEqual(["b.log"])
    expect(writesOf({ tool: "run", command: "cd packages/widgets && cat > src/Widget.ts" })).toEqual([FIXED_FILE])
    expect(writesOf({ tool: "run", command: "cat > src/Widget.ts", cwd: "packages/widgets" })).toEqual([FIXED_FILE])
    expect(writesOf({ tool: "run", command: "echo > /tmp/x.log", cwd: "packages/widgets" })).toEqual(["/tmp/x.log"])
    expect(writesOf({ tool: "read" })).toEqual([])
  })

  test("production's time is each command's and each tool's measured cost, and the model's own", () => {
    expect(projectedMs([], 1_000)).toBe(1_000)
    expect(projectedMs([{ tool: "run", command: "ls" }, { tool: "read" }, { tool: "write", path: FIXED_FILE }], 5_000))
      .toBe(5_000 + RUN_MS + 2 * TOOL_MS)
    expect(BUDGET_MS).toBe(600_000)
  })
})
