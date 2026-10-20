/** Check the install instructions against the checked-out CLI, never a PATH binary. */
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { MARKER, parseToc, route } from "./sync-app-docs.mjs"
import { MARKER as CLI_MARKER } from "./gen-cli-reference.mjs"

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const root = resolve(site, "../..")
const read = (path) => readFileSync(join(root, path), "utf8")
const installation = read("apps/site/docs/installation.mdx")
const toc = parseToc(read("apps/app/src/docs/toc.ts"))
const appPages = readdirSync(join(root, "apps/app/src/docs/pages")).filter((name) => name.endsWith(".md")).sort()

// In-app commands and released source schemas have no planned exceptions.
const snippets = (text) => [...text.matchAll(/```(?:bash|sh|shell)\s*\n([\s\S]*?)```|`(smthrs [^`\n]+)`/g)].flatMap((match) => {
  const preceding = text.slice(0, match.index)
  const section = preceding.slice(preceding.lastIndexOf("\n## "))
  return (match[1] ?? match[2]).split("\n").filter((line) => /^smthrs\s/.test(line.trim())).map((line) => ({ command: line.trim(), section }))
})

function validateCommands(text, commands) {
  for (const { command } of snippets(text)) {
    const words = command.split(/\s+/).slice(1)
    const shipped = commands.filter(entry => words.slice(0, entry.name.split(" ").length).join(" ") === entry.name)
      .sort((a, b) => b.name.length - a.name.length)[0]
    assert.ok(shipped, `${command} does not ship`)
    const rest = words.slice(shipped.name.split(" ").length)
    const positional = []
    for (let i = 0; i < rest.length; i++) {
      const word = rest[i]
      if (!word.startsWith("--")) { positional.push(word); continue }
      const option = word.slice(2).split("=")[0]
      const schema = shipped.schema?.options?.properties?.[option]
      assert.ok(schema, `${shipped.name} has no --${option}`)
      if (schema.type !== "boolean" && !word.includes("=")) {
        assert.ok(rest[i + 1] && !rest[i + 1].startsWith("--"), `${command}: --${option} needs a value`)
        i++
      }
    }
    const args = shipped.schema?.args
    assert.ok(positional.length >= (args?.required?.length ?? 0), `${command}: missing argument`)
    assert.ok(positional.length <= Object.keys(args?.properties ?? {}).length, `${command}: unexpected argument`)
  }
}

test("all documented CLI commands and arguments exist in the source CLI", async () => {
  const { installEffectResolution } = await import(join(root, "packages/smithers/build/build-cli/src/effect-resolution.js"))
  installEffectResolution()
  const { makeCli } = await import(join(root, "packages/smithers/src/Cli.ts"))
  const cli = makeCli({ environment: { ...process.env, NO_COLOR: "1" } })
  let output = ""
  let status = 0
  await cli.serve(["--llms-full", "--format", "json"], {
    stdout: (text) => { output += text },
    exit: (code) => { status = code }
  })
  assert.equal(status, 0, output)
  const { commands } = JSON.parse(output)
  assert.ok(Array.isArray(commands) && commands.length > 0, "source CLI must return a command manifest")
  // Root flags are not subcommands in the manifest; execute the documented one.
  output = ""
  await cli.serve(["--version"], {
    stdout: (text) => { output += text },
    exit: (code) => { status = code }
  })
  assert.equal(status, 0, output)
  assert.ok(output.includes(JSON.parse(read("packages/smithers/package.json")).version), output)
  validateCommands(installation, [...commands, { name: "--version" }])
  assert.ok(appPages.length > 0, "the app docs must have pages")
  for (const name of appPages) validateCommands(read(`apps/app/src/docs/pages/${name}`), commands)
})

test("command guard rejects invented commands, flags and invalid positional arguments", () => {
  const commands = [{ name: "host restore", schema: { args: { properties: { directory: {} }, required: ["directory"] }, options: { properties: {} } } }]
  assert.throws(() => validateCommands("`smthrs invented`", commands), /does not ship/)
  assert.throws(() => validateCommands("`smthrs host restore --invented`", commands), /has no --invented/)
  assert.throws(() => validateCommands("`smthrs host restore`", commands), /missing argument/)
  assert.throws(() => validateCommands("`smthrs host restore one two`", commands), /unexpected argument/)
  validateCommands("`smthrs host restore /Users/will/Backups/smithers`", commands)
})

test("the public sidebar is the app's toc, then Install beside self-hosting, then the reference with the CLI", () => {
  const config = read("apps/site/astro.config.mjs")
  assert.match(config, /^import sidebar from "\.\/src\/data\/docs-sidebar\.json" with \{ type: "json" \}$/m)
  assert.match(config, /^\s*sidebar\n\s*\}\)/m, "Starlight must take the generated sidebar unchanged")
  const sidebar = JSON.parse(read("apps/site/src/data/docs-sidebar.json"))
  const slug = (page) => page === "welcome" ? "docs" : `docs/${page}`
  const expected = toc.map(({ label, pages }) => ({ label, items: pages.map((page) => ({ slug: slug(page) })) }))
  const ownMac = expected.find(({ label }) => label === "On your own Mac")
  assert.ok(ownMac, "toc.ts must keep the On your own Mac section that Install joins")
  ownMac.items.push({ slug: "docs/installation" })
  expected.push({
    label: "Reference",
    items: [
      { label: "HTTP and RPC API", slug: "docs/reference/http-api" },
      { label: "CLI", slug: "docs/reference/cli" },
      { label: "Library API", slug: "docs/reference/api" }
    ]
  })
  assert.deepEqual(sidebar, expected)
  assert.doesNotMatch(JSON.stringify(sidebar), /autogenerate/)
})

test("installation keeps the project opening", () => {
  const { description } = JSON.parse(read("apps/site/src/data/project.json"))
  const opening = installation.split("{/* generated:project-description end */}")[0].split("*/}")[1]?.trim()
  assert.equal(opening, description)

})

// Frozen retirement inventory for #3458; installation is the replacement page.
test("every retired inventory path is absent", () => {
  const retired = JSON.parse(read("apps/site/docs/retired-pages.json"))
  assert.equal(retired.length, 51)
  assert.equal(new Set(retired).size, retired.length)
  for (const path of retired) assert.equal(existsSync(join(root, path)), false, `retired page exists: ${path}`)
})

test("the planned Homebrew action stays tied to its release ticket", () => {
  const section = installation.split("## Mac host (planned)\n")[1]?.split("\n## ")[0]
  assert.match(section, /\*\*Planned\.\*\*/)
  assert.match(section, /brew install smithersai\/tap\/smithers/)
  assert.match(read(".specs/engineering/tickets/T-INS-05.md"), /smithersai\/homebrew-tap/)
})

test("the site has no empty documentation pages", () => {
  const content = join(site, "src/content/docs")
  for (const path of readdirSync(content, { recursive: true }).filter(path => /\.mdx?$/.test(path))) {
    assert.ok(readFileSync(join(content, path), "utf8").trim().length > 0, `empty documentation page: ${path}`)
  }
})

test("setup puts Address and App before the owner claim and repository", () => {
  const section = installation.split("## Complete setup\n")[1]?.split("\n## ")[0]
  assert.ok(section, "setup section must exist")
  assert.deepEqual([...section.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map(match => match[1]),
    ["Address:", "GitHub App:", "Owner sign-in:", "Repository:", "Model access:"])
  for (const claim of [/This Mac/, /network address/, /callback is registered/, /through the new App/,
    /squash merging/, /retry/, /\*\*fast\*\*/, /\*\*coding\*\*/, /\*\*Decisions\*\*/,
    /provider key or ChatGPT sign-in/, /AI Gateway key/, /Without a fast-model key/]) assert.match(section, claim)
  assert.doesNotMatch(section, /\bjev\b/i)
})


test("the published docs tree holds the app's pages, installation, the CLI reference and the API", () => {
  const content = join(site, "src/content/docs/docs")
  const paths = readdirSync(content, { recursive: true }).filter(path => /\.mdx?$/.test(path))
  const projected = toc.flatMap(({ pages }) => pages).map((page) => page === "welcome" ? "index.md" : `${page}.md`)
  assert.ok(paths.includes("installation.mdx"))
  assert.ok(paths.includes("reference/http-api.mdx"))
  assert.ok(paths.includes("reference/cli.md"))
  assert.ok(readFileSync(join(content, "reference/cli.md"), "utf8").includes(CLI_MARKER), "the CLI reference must be generated from the captured help")
  assert.ok(existsSync(join(site, "public/docs/reference/cli.md")), "the CLI reference must publish its Markdown copy")
  assert.ok(projected.includes("index.md"), "the welcome page publishes at /docs/")
  for (const path of paths) assert.ok(path === "installation.mdx" || path === "reference/http-api.mdx" || path === "reference/cli.md" || path.startsWith("reference/api/") || projected.includes(path), `retired projection remains: ${path}`)
  for (const path of projected) assert.ok(readFileSync(join(content, path), "utf8").includes(MARKER), `${path} must be projected from apps/app/src/docs`)
  const retired = JSON.parse(read("apps/site/docs/retired-projections.json"))
  for (const path of retired) assert.equal(existsSync(join(root, path)), false, `retired projection exists: ${path}`)
  const redirects = read("apps/site/public/_redirects")
  const live = new Set([...toc.flatMap(({ pages }) => pages).map(route), "/docs/reference/cli/"].flatMap((path) => [path, path.slice(0, -1)]))
  for (const line of redirects.split("\n").filter(line => line && !line.startsWith("#"))) {
    const [source, destination] = line.split(/\s+/)
    assert.ok(!live.has(source), `redirect hides a published docs page: ${line}`)
    if (destination.startsWith("/docs/")) assert.ok(destination === "/docs/installation/" || destination === "/docs/reference/http-api/" || destination.startsWith("/docs/reference/api/"), `redirect points at retired page: ${line}`)
  }
  for (const [, destination] of installation.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(destination.startsWith("https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/"), `unexpected install guide destination: ${destination}`)
    const sourcePath = destination.split("/blob/main/")[1].split("#")[0]
    assert.ok(existsSync(join(root, sourcePath)), `missing canonical guide: ${destination}`)
  }
  assert.equal(existsSync(join(site, "src/pages/pricing.astro")), false)
  assert.doesNotMatch(read("apps/site/src/layouts/Base.astro"), /href="\/pricing\/"/)
})


test("the public installation entry gives the current npm path before planned hosting", () => {
  const cli = installation.split("## Install the CLI\n")[1]?.split("\n## ")[0]
  assert.ok(cli, "the Docs entry must show the available CLI install")
  const canonical = read("packages/smithers/docs/installation.md")
  const requiredNode = JSON.parse(read("packages/smithers/package.json")).engines.node.replace(">=", "")
  assert.ok(cli.includes(`Node.js ${requiredNode} or later`), "Node requirement must match the published CLI")
  for (const command of ["brew install jj jq", "npm install -g smthrs@next", "smthrs --version"]) {
    assert.ok(cli.includes(command), `missing prerequisite or install command: ${command}`)
    assert.ok(canonical.includes(command), `command differs from canonical installation: ${command}`)
  }
  assert.match(cli, /release candidate/)
  assert.match(cli, /https:\/\/github.com\/smithersai\/smithers\/blob\/main\/packages\/smithers\/docs\/installation\.md#install-the-cli/)
  assert.match(cli, /https:\/\/github.com\/smithersai\/smithers\/blob\/main\/packages\/smithers\/docs\/guides\/change-code\.md/)
  assert.ok(installation.indexOf("## Install the CLI") < installation.indexOf("## Mac host (planned)"))
  assert.doesNotMatch(cli, /host start|smithersai\/tap/)
})

test("MCP doctor help describes the smoke test instead of registration", async () => {
  const { installEffectResolution } = await import(join(root, "packages/smithers/build/build-cli/src/effect-resolution.js"))
  installEffectResolution()
  const { makeCli } = await import(join(root, "packages/smithers/src/Cli.ts"))
  let output = ""
  let status = 0
  const cli = makeCli()
  for (const [args, usage] of [
    [["mcp", "doctor", "--help"], /Usage: smthrs mcp doctor/],
    [["mcp", "--help"], /doctor\s+Validate MCP server startup/],
    [["mcp", "add", "--help"], /Usage: smthrs mcp add/]
  ]) {
    output = ""
    await cli.serve(args, {
      stdout: text => { output += text }, exit: code => { status = code }
    })
    assert.equal(status, 0, output)
    assert.match(output, usage)
  }
})
