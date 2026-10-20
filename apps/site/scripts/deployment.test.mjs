/** Validate real Alchemy entry points offline; never evaluate or deploy a stack. */
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const root = resolve(import.meta.dirname, "../../..")
const appEntries = ["bug-worker"].map((name) => join(root, "apps", name, "alchemy.run.ts"))

/** The smithers.sh zone on account dd3525a4132493566aeb38de533c8827. */
const SMITHERS_ZONE_ID = "8ebd98d2f0dc7d8db2e61f31ebc19c14"

test("all deployment entry points import as Alchemy 2 stack effects", async () => {
  const entryPoints = [
    ...appEntries,
  ]
  for (const path of entryPoints) {
    const module = await import(pathToFileURL(path).href)
    assert.ok(Effect.isEffect(module.default), `${path}: the CLI needs a default-exported stack effect`)
  }
})

test("stack properties and shared implementation typecheck against the declared Alchemy API", () => {
  const program = ts.createProgram({
    rootNames: [
      ...appEntries,
    ],
    options: {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: true,
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext
    }
  })
  const errors = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
    diagnostic.category === ts.DiagnosticCategory.Error
  )
  assert.equal(
    errors.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    })
  )
})

test("app stacks retain their Worker routing and defer required redacted credentials", async () => {
  const [bugs] = await Promise.all(appEntries.map((path) => import(pathToFileURL(path).href)))
  // The live Worker, KV namespace and hostnames observed on Cloudflare 2026-09-23.
  // Another name creates a second Worker and an empty namespace; a declared
  // domain detaches every live hostname it does not list.
  assert.equal(bugs.workerProps.name, "smithers-bug-worker-smithers-bug-worker-williamcory")
  assert.equal(bugs.bugReportsProps.title, "smithers-bug-worker-bug-reports-williamcory")
  assert.equal(bugs.workerProps.main, "src/worker.ts")
  assert.deepEqual(bugs.workerProps.domain, { name: "bug.smithers.sh", aliases: ["bugs.smithers.sh"], zoneId: SMITHERS_ZONE_ID })
  // A workers.dev origin would serve the same routes outside the smithers.sh zone's rules.
  assert.equal(bugs.workerProps.workersDev, false)
  assert.equal(bugs.workerProps.crons, undefined)
  for (const retired of ["REPO_COMPLETIONS", "RESEND_API_KEY", "NOTIFICATION_FROM", "GITHUB_FORK_TOKEN"]) {
    assert.equal(retired in bugs.workerProps.env, false)
  }
  assert.equal(bugs.workerProps.env.PUBLIC_BASE_URL, "https://bug.smithers.sh")
  assert.ok(Effect.isEffect(bugs.workerProps.env.BUGS))

  // A deploy from a shell without a binding's variable must fail, not delete the binding.
  const credentials = [[bugs.workerProps.env.BUG_ADMIN_TOKEN, "BUG_ADMIN_TOKEN"]]
  for (const [config, name] of credentials) {
    assert.ok(Config.isConfig(config), `${name}: resolve credentials only while evaluating the stack`)
    assert.equal(Effect.runSyncExit(config.parse(ConfigProvider.fromUnknown({})))._tag, "Failure")
    assert.equal(Effect.runSyncExit(config.parse(ConfigProvider.fromUnknown({ [name]: "  " })))._tag, "Failure")
    const value = Effect.runSync(
      config.parse(ConfigProvider.fromUnknown({ [name]: "  deployment-test-placeholder  " }))
    )
    assert.ok(Redacted.isRedacted(value))
    assert.equal(Redacted.value(value), "deployment-test-placeholder")
  }
})

/**
 * The hostnames a stack's Workers claim, read from source without running any of it: each `domain` (its name,
 * aliases and redirects) and each route `pattern` in every file of the stack's relative import graph that imports
 * `alchemy/Cloudflare`. Running a stack would load its whole app under Node; Vite and Alchemy bundle that code, and
 * Node's loader rejects its extensionless imports. A claim that isn't a literal fails: an unread claim would pass.
 */
const stackHostnames = (stackPath) => {
  const claims = []
  const seen = new Set()
  const pending = [stackPath]
  while (pending.length > 0) {
    const path = pending.pop()
    if (seen.has(path)) continue
    seen.add(path)
    const text = readFileSync(path, "utf8")
    const imports = ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName)
    for (const specifier of imports.filter((name) => name.startsWith("."))) {
      const base = resolve(dirname(path), specifier)
      const file = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]
        .find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate))
      if (file !== undefined) pending.push(file)
    }
    if (!imports.includes("alchemy/Cloudflare")) continue
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const where = (node) => `${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`
    const bare = (node) => {
      while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression
      return node
    }
    const unreadable = (node) => `${where(node)}: declare hostnames as literals, so this test reads them without running the stack`
    const string = (node) => {
      assert.ok(ts.isStringLiteralLike(bare(node)), unreadable(node))
      return bare(node).text
    }
    const strings = (node) => {
      assert.ok(ts.isArrayLiteralExpression(bare(node)), unreadable(node))
      return bare(node).elements.map(string)
    }
    const fields = (node) => {
      const object = bare(node)
      assert.ok(ts.isObjectLiteralExpression(object), unreadable(node))
      return new Map(object.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? [[property.name.text, property.initializer]]
          : []
      ))
    }
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          const key = property.name !== undefined && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : undefined
          if ((key === "domain" || key === "routes") && !ts.isPropertyAssignment(property)) assert.fail(unreadable(property))
        }
        const props = fields(node)
        const name = props.get("name")
        const owner = name !== undefined && ts.isStringLiteralLike(bare(name)) ? bare(name).text : where(node)
        const domain = props.get("domain")
        if (domain !== undefined && bare(domain).kind !== ts.SyntaxKind.NullKeyword) {
          if (ts.isStringLiteralLike(bare(domain))) claims.push({ host: bare(domain).text, owner })
          else {
            const declared = fields(domain)
            assert.ok(bare(domain).properties.every(ts.isPropertyAssignment), unreadable(domain))
            const hosts = [string(declared.get("name") ?? domain)]
            for (const list of ["aliases", "redirects"]) if (declared.has(list)) hosts.push(...strings(declared.get(list)))
            for (const host of hosts) claims.push({ host, owner })
          }
        }
        const routes = props.get("routes")
        if (routes !== undefined) {
          assert.ok(ts.isArrayLiteralExpression(bare(routes)), unreadable(routes))
          for (const route of bare(routes).elements) {
            claims.push({ host: string(fields(route).get("pattern") ?? route).split("/")[0], owner })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return claims
}

test("every hostname has one owning Worker, in this repository or in the canary manifest", async () => {
  // A zone route wins over a custom domain on the same hostname, so a second
  // claim is never a fallback: it is a Worker nobody can reach, deployed and
  // tested as if it were live.
  const owners = new Map()
  const claim = (host, worker) => owners.set(host, new Set([...(owners.get(host) ?? []), worker]))
  const apps = join(root, "apps")
  for (const app of readdirSync(apps)) {
    const wranglerPath = join(apps, app, "wrangler.jsonc")
    if (existsSync(wranglerPath)) {
      const { config, error } = ts.parseConfigFileTextToJson(wranglerPath, readFileSync(wranglerPath, "utf8"))
      assert.equal(error, undefined, wranglerPath)
      for (const route of config.routes ?? []) claim(route.pattern.split("/")[0], config.name)
    }
    const stackPath = join(apps, app, "alchemy.run.ts")
    if (existsSync(stackPath)) {
      for (const { host, owner } of stackHostnames(stackPath)) claim(host, owner)
    }
  }
  // An empty static read must not pass for "no conflicts": it sees bug-worker's declared domain.
  for (const host of ["bug.smithers.sh", "bugs.smithers.sh"]) {
    assert.deepEqual([...owners.get(host) ?? []], ["smithers-bug-worker-smithers-bug-worker-williamcory"], host)
  }
  // Deployed from another repository and probed by the canary.
  const { BACKING_WORKERS, RETIRED_WORKERS } = await import("../../server/scripts/canary/workers-manifest.ts")
  for (const worker of [...BACKING_WORKERS, ...RETIRED_WORKERS]) {
    for (const origin of [worker.origin, ...worker.alternateOrigins]) {
      if (origin !== undefined) claim(new URL(origin).hostname, `${worker.name} (canary manifest)`)
    }
  }
  const contested = [...owners].filter(([, workers]) => workers.size > 1).map(([host, workers]) => `${host}: ${[...workers].join(", ")}`)
  assert.deepEqual(contested, [])
})


test("every shared-state stack plans against one record under stage prod", () => {
  const read = (path) => readFileSync(join(root, path), "utf8")
  // Local state lives in a gitignored .alchemy/ on whichever machine deployed
  // last, and the CLI's default stage is dev_$USER, so either one gives each
  // machine its own view of production.
  const stacks = [
    { stack: "apps/bug-worker/alchemy.run.ts", pkg: "apps/bug-worker/package.json", qualifiedOnly: true },
  ]
  for (const { stack, pkg, qualifiedOnly } of stacks) {
    const source = read(stack)
    assert.ok(source.includes("state: Cloudflare.state()"), `${stack}: state must live in the account's alchemy-state-store`)
    assert.ok(!source.includes("localState"), `${stack}: local state is one machine's view`)
    const packageScripts = JSON.parse(read(pkg)).scripts
    const scripts = Object.values(packageScripts).filter((script) => script.startsWith("alchemy "))
    assert.deepEqual(scripts.sort(), [
      "alchemy deploy --dry-run --stage prod",
      ...(qualifiedOnly ? [] : ["alchemy deploy --stage prod"]),
      "alchemy destroy --stage prod"
    ].sort(), pkg)
    assert.equal(packageScripts.deploy, qualifiedOnly
      ? "node ../../.smithers/flows/rollout/refuse-unqualified.mjs"
      : "alchemy deploy --stage prod", pkg)
    if (qualifiedOnly) {
      for (const [name, script] of Object.entries(packageScripts)) {
        if (name !== "plan") assert.doesNotMatch(script, /\balchemy\s+deploy\b/, `${pkg}:${name}: only the qualified Cloud host may deploy`)
      }
    }
  }
})

test("bug-worker local deploy commands refuse unqualified publication", () => {
  const guard = join(root, ".smithers/flows/rollout/refuse-unqualified.mjs")
  for (const app of ["bug-worker"]) {
    for (const flags of [[], ["--stage", "prod"], ["--adopt", "--stage", "prod"]]) {
      const label = `${app} ${flags.join(" ")}`
      const result = spawnSync(process.execPath, [guard, ...flags], { cwd: join(root, "apps", app), encoding: "utf8" })
      assert.equal(result.status, 1, label)
      assert.equal(result.stdout, "", label)
      assert.match(result.stderr, /Deployment refused: a qualified Cloud rollout is required/, label)
    }
  }
})

test("documented deploy commands hand Alchemy its flags directly", () => {
  // pnpm 11 forwards a literal `--` to the script, and Alchemy's CLI reads
  // every argument after `--` as the main file: `run deploy -- --adopt`
  // looks for a file named --adopt and never adopts.
  const docs = [
    "apps/bug-worker/README.md",
    "apps/bug-worker/alchemy.run.ts",
  ]
  for (const path of docs) {
    assert.doesNotMatch(readFileSync(join(root, path), "utf8"), /(run (plan|deploy|destroy)|docs:deploy) -- /, path)
  }
})
