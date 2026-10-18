// The CLI reference generator: captured help and manifest in, Markdown
// sections out; every disagreement between the two sources throws; the script
// writes, checks and reports drift in a copied tree.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { COPY, MARKER, PAGE, prose, renderBody, typeOf } from "./gen-cli-reference.mjs"

const globalsHelp = [
  "Custom Global Options:",
  "  --audience <auto|human|agent>  Presentation audience (default: auto)",
  ""
]
const page = (head, usage, ...sections) => [head, "", `Usage: ${usage}`, "", ...sections.flatMap((lines) => [...lines, ""]), ...globalsHelp].join("\n")
const verbose = { default: false, description: "Show redacted diagnostic details", type: "boolean" }

/** Two groups: `host` has only subcommands; `stack` is a command and a group. */
function fixture() {
  const manifest = {
    version: "incur.v1",
    commands: [
      { name: "host backup", description: "Back up the installation", schema: { args: { type: "object", properties: {} }, options: { type: "object", properties: { verbose }, required: ["verbose"] } } },
      {
        name: "stack",
        description: "Show the stack",
        schema: {
          args: { type: "object", properties: {} },
          options: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 500, description: "Runs per page" } } }
        }
      },
      {
        name: "stack move",
        description: "Reorder an item",
        schema: {
          args: {
            type: "object",
            properties: { n: { type: "string", pattern: "^T[1-9]\\d*$" }, direction: { type: "string", enum: ["up", "down"], description: "Which way" } },
            required: ["n", "direction"]
          },
          options: {
            type: "object",
            properties: {
              user: { default: "developer", type: "string", description: "Guest user" },
              dryRun: { type: ["string", "null"] },
              reason: { type: "string", description: "Why it moves" }
            },
            required: ["user", "reason"]
          }
        }
      }
    ],
    globals: { type: "object", properties: { audience: { default: "auto", description: "Presentation audience", type: "string", enum: ["auto", "human", "agent"] } }, required: ["audience"] }
  }
  const help = new Map([
    ["", page("smthrs@1.2.3 — Operate flows", "smthrs <command>", ["Commands:", "  host   Operate the host", "  stack  Show the stack"], ["Global Options:", "  --format <toon|json>  Output format", "  --help               Show help"])],
    ["host", page("smthrs host — Operate this installation’s host", "smthrs host <command>", ["Commands:", "  backup  Back up the installation"])],
    ["host backup", page("smthrs host backup — Back up the installation", "smthrs host backup [options]", ["Options:", "  --verbose  Show redacted diagnostic details"])],
    ["stack", page("smthrs stack — Show the stack", "smthrs stack [options] | <command>", ["Commands:", "  move  Reorder an item"], ["Options:", "  --limit <number>"])],
    ["stack move", page("smthrs stack move — Reorder an item", "smthrs stack move <n> <direction> [options]",
      ["Arguments:", "  n", "  direction  Which way"],
      ["Options:", "  --user, -u <string>  (default: developer)", "  --dry-run <value>", "  --reason <string>"])]
  ])
  return { manifest, help: (path) => help.get(path), map: help }
}

test("one section per command: usage from the help, tables from the schema, globals once at the top", () => {
  const body = renderBody(fixture())
  assert.ok(body.startsWith("Every command in `smthrs` 1.2.3, as its `--help` describes it.\n\n```bash\nnpm install -g smthrs@next\n```\n\n## Commands\n"))
  assert.ok(body.includes([
    "| Command | Description |",
    "| --- | --- |",
    "| [`host`](#host) | Operate this installation’s host |",
    "| [`stack`](#stack) | Show the stack |"
  ].join("\n")))
  assert.ok(body.includes([
    "## Global options",
    "",
    "Every command takes these options.",
    "",
    "| Option | Type | Default | Required | Description |",
    "| --- | --- | --- | --- | --- |",
    "| `--audience` | one of `auto`, `human`, `agent` | `auto` | no | Presentation audience |",
    "",
    "`smthrs --help` also lists these built-in options.",
    "",
    "| Option | Value | Description |",
    "| --- | --- | --- |",
    "| `--format` | `toon\\|json` | Output format |",
    "| `--help` |  | Show help |"
  ].join("\n")), "a schema-required global with a default is not required of the reader")
  // A group without a command of its own shows its usage and no tables.
  assert.ok(body.includes("## `host`\n\nOperate this installation’s host\n\n```text\nsmthrs host <command>\n```\n\n### `host backup`\n"))
  assert.ok(body.includes("## `stack`\n\nShow the stack\n\n```text\nsmthrs stack [options] | <command>\n```\n\n| Option | Type | Default | Required | Description |\n| --- | --- | --- | --- | --- |\n| `--limit` | integer, minimum 1, maximum 500 |  | no | Runs per page |\n\n### `stack move`"))
  assert.ok(body.endsWith([
    "### `stack move`",
    "",
    "Reorder an item",
    "",
    "```text",
    "smthrs stack move <n> <direction> [options]",
    "```",
    "",
    "| Argument | Type | Default | Required | Description |",
    "| --- | --- | --- | --- | --- |",
    "| `n` | string, pattern `^T[1-9]\\d*$` |  | yes |  |",
    "| `direction` | one of `up`, `down` |  | yes | Which way |",
    "",
    "| Option | Type | Default | Required | Description |",
    "| --- | --- | --- | --- | --- |",
    "| `--user`, `-u` | string | `developer` | no | Guest user |",
    "| `--dry-run` | string |  | no |  |",
    "| `--reason` | string |  | yes | Why it moves |",
    ""
  ].join("\n")))
  assert.ok(body.indexOf("## `host`") < body.indexOf("### `host backup`") && body.indexOf("### `host backup`") < body.indexOf("## `stack`"))
})

test("a disagreement between the help and the manifest throws instead of publishing", () => {
  const cases = [
    ["help lacks a schema option", (f) => f.map.set("host backup", f.map.get("host backup").replace("  --verbose  Show redacted diagnostic details\n", "")), /schema has option verbose, but the help lists no --verbose/],
    ["help lists an option the schema lacks", (f) => f.map.set("stack", f.map.get("stack").replace("  --limit <number>", "  --limit <number>\n  --all")), /lists --all, which the schema lacks/],
    ["arguments differ", (f) => f.map.set("stack move", f.map.get("stack move").replace("  n\n", "")), /help lists arguments \[direction\], the schema \[n, direction\]/],
    ["descriptions differ", (f) => { f.manifest.commands[0].description = "Back it up" }, /manifest says "Back it up", the help "Back up the installation"/],
    ["a capture is missing", (f) => f.map.delete("host"), /no help capture for smthrs host/],
    ["a schema keyword has no rendering", (f) => { f.manifest.commands[1].schema.options.properties.limit.format = "int32" }, /--limit: schema keyword format has no rendering/],
    ["globals differ per command", (f) => f.map.set("host", f.map.get("host").replace("Presentation audience (default: auto)", "Audience")), /different global options than smthrs --help/],
    ["the root names no version", (f) => f.map.set("", f.map.get("").replace("smthrs@1.2.3", "smthrs")), /names no version/]
  ]
  for (const [name, change, error] of cases) {
    const f = fixture()
    change(f)
    assert.throws(() => renderBody(f), error, name)
  }
})

test("CLI text renders literally and types read as the schema states them", () => {
  assert.equal(prose("Local path or <workspace-id>:<path>"), "Local path or \\<workspace-id>:\\<path>")
  assert.equal(prose("seeds ANTHROPIC_API_KEY, a _b_ *c* [d] `e`"), "seeds ANTHROPIC_API_KEY, a \\_b\\_ \\*c\\* \\[d\\] \\`e\\`")
  assert.equal(typeOf({ anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }, "t"), "string, min length 1")
  assert.equal(typeOf({ type: "array", items: { type: "string" }, minItems: 1 }, "t"), "array of string, min items 1")
  assert.equal(typeOf({ type: "integer", exclusiveMinimum: 0, maximum: Number.MAX_SAFE_INTEGER }, "t"), "integer, greater than 0")
  assert.equal(typeOf({ anyOf: [{ type: "object", properties: {}, additionalProperties: {} }, { type: "null" }] }, "t"), "object")
  assert.throws(() => typeOf({ description: "no type" }, "t"), /t: schema has no type/)
})

test("the script writes the page and its copy, then --check names drift without changing it", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gen-cli-reference-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const script = join(root, "apps/site/scripts/gen-cli-reference.mjs")
  mkdirSync(dirname(script), { recursive: true })
  cpSync(new URL("./gen-cli-reference.mjs", import.meta.url), script)
  const { manifest, map } = fixture()
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put("apps/site/src/data/cli-commands.json", JSON.stringify(manifest))
  for (const [path, text] of map) {
    const tokens = path === "" ? ["smthrs"] : path.split(" ")
    put(join("apps/site/src/data/help", ...tokens.slice(0, -1), `${tokens.at(-1)}.txt`), text)
  }
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" })
  const read = (path) => readFileSync(join(root, path), "utf8")

  const written = run()
  assert.equal(written.status, 0, written.stderr)
  const sitePage = read(PAGE)
  assert.ok(sitePage.startsWith(`---\n${MARKER}\neditUrl: https://github.com/smithersai/smithers/edit/main/apps/site/scripts/gen-cli-reference.mjs\ntitle: "CLI reference"\ndescription: "`))
  assert.match(sitePage, /^ {6}type: text\/markdown\n {6}href: \/docs\/reference\/cli\.md\n---\n\nEvery command in `smthrs` 1\.2\.3/m)
  assert.doesNotMatch(sitePage.split("\n---\n")[1], /^# /m, "the frontmatter title owns the page heading")
  const copy = read(COPY)
  assert.ok(copy.startsWith("# CLI reference\n\n> Every smthrs command"))
  assert.equal(copy.split("\n\n").slice(2).join("\n\n"), sitePage.split("\n---\n\n")[1], "the copy carries the page's body")
  assert.equal(run("--check").status, 0)

  put(PAGE, sitePage.replace("Reorder an item", "Move it"))
  const drifted = run("--check")
  assert.equal(drifted.status, 1)
  assert.match(drifted.stderr, /cli reference drift: apps\/site\/src\/content\/docs\/docs\/reference\/cli\.md differs/)
  assert.match(drifted.stderr, /run node apps\/site\/scripts\/gen-cli-reference\.mjs/)
  assert.match(read(PAGE), /Move it/, "check mode writes nothing")
  rmSync(join(root, COPY))
  assert.match(run("--check").stderr, /public\/docs\/reference\/cli\.md is missing/)
  assert.equal(run().status, 0)
  assert.equal(run("--check").status, 0)
})
