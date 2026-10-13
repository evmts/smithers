/** Disposable npm/pnpm consumers of unchanged release manifests or candidate bytes. */
import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

import { build as bundle } from "esbuild"
import { valid } from "semver"
import { EXPECTED_EFFECT_VERSION } from "./check-single-effect-version.mjs"
import { assertEffectFamilyInstalled, mcpInitialize } from "./release-mcp-handshake.mjs"
import { captureProcess } from "./release-process.mjs"
import { releaseRegistry } from "./release-registry.mjs"
import { isMain, repoRoot } from "./workspace-packages.mjs"

// The one Effect pin every published manifest carries; declared once for the whole release line.
const effect = EXPECTED_EFFECT_VERSION
/** The published RC one below the pin: an exact library peer must refuse it. */
export const adjacentEffectVersion = effect.replace(/-rc\.(\d+)$/, (_, rc) => "-rc." + (Number(rc) - 1))
const literally = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
/** Consumer requests must select this candidate, including a future stable cut. */
export const candidateVersion = (entries) => {
  const versions = new Set(entries.map((entry) => entry.version))
  assert.equal(versions.size, 1, "candidate must have one synchronized release version")
  const [version] = versions
  assert.equal(valid(version), version, "candidate release version must be exact semver")
  return version
}
// Temporary projects must select the same pnpm toolchain as the repository.
// Otherwise a different pnpm on a Node-version PATH can change command support.
export const releasePackageManager =
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")).packageManager
const stores = new Map()
/** Reuse the workspace's package cache from external consumers without linking its dependencies. */
export const consumerCacheFlags = (manager, workspace = repoRoot) => {
  if (manager === "npm") return ["--prefer-offline"]
  if (manager !== "pnpm") throw new Error(`Unsupported release package manager: ${manager}`)
  if (!stores.has(workspace)) {
    const store = execFileSync("pnpm", ["store", "path"], { cwd: workspace, encoding: "utf8" }).trim()
    if (!isAbsolute(store)) throw new Error(`pnpm store path did not return an absolute directory: ${store}`)
    stores.set(workspace, store)
  }
  return ["--prefer-offline", "--store-dir", stores.get(workspace), "--reporter=append-only"]
}
const installedConsumerDirectory = resolve(import.meta.dirname, "fixtures/installed-consumer")
const runners = ["vitest", "@effect/vitest", "@smthrs/testing"]
const nodeRuntime = ["@smthrs/platform-node", "@effect/platform-node", "@effect/platform-node-shared"]
const nodeAdapters = [...nodeRuntime, "@effect/sql-sqlite-node"]
const telemetryAdapters = [
  "@opentelemetry/exporter-logs-otlp-http",
  "@opentelemetry/exporter-metrics-otlp-http",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/sdk-trace-node",
  "@opentelemetry/sdk-trace-web"
]
const browserAdapters = ["@smthrs/platform-browser", "@smthrs/platform-bun", "@effect/platform-bun"]
const flowsNodeHost = ["@smthrs/platform-node", "@effect/sql-sqlite-node"]
const absentByDefault = [...runners, ...nodeAdapters, ...telemetryAdapters, ...browserAdapters, "react", "tsx", "vite"]

// Explicit policy expectations; never derived from the manifest being tested.
export const minimalProfiles = (entries) => {
  const firstParty = candidateVersion(entries)
  return [
    ...["database", "gateway", "observability"].map((name) => ({
      name: name + "-default",
      dependencies: { ["@smthrs/" + name]: firstParty, effect },
      absent: absentByDefault,
      imports: ["@smthrs/" + name]
    })),
    {
      name: "flows-default",
      dependencies: { "@smthrs/flows": firstParty, effect },
      // The barrel is the package a Node program installs, so it brings the
      // Node host and SQLite driver its NodeRuntime subpath imports (#3838).
      // The Effect platform adapters stay private to @smthrs/platform-node.
      required: flowsNodeHost,
      absent: absentByDefault.filter((name) => !flowsNodeHost.includes(name)),
      imports: ["@smthrs/flows", "@smthrs/flows/NodeRuntime"]
    }
  ]
}

export const adapterProfiles = (entries) => {
  const firstParty = candidateVersion(entries)
  return [
    {
      name: "cli-default",
      dependencies: { "@smthrs/cli": firstParty, effect },
      // The executable selects its native host on Node or Bun; libraries keep
      // private adapters; this command installs only the native SQL peer.
      required: ["@effect/sql-sqlite-node"],
      absent: [
        ...runners,
        "@effect/platform-node",
        "@effect/platform-node-shared",
        ...browserAdapters,
        ...telemetryAdapters
      ],
      imports: ["@smthrs/cli"]
    },
    {
      name: "node",
      dependencies: {
        "@smthrs/flows": firstParty,
        "@smthrs/gateway": firstParty,
        "@smthrs/observability": firstParty,
        "@smthrs/platform-node": firstParty,
        "@effect/platform-node": effect,
        "@effect/platform-node-shared": effect,
        "@effect/sql-sqlite-node": effect,
        effect,
        "@opentelemetry/exporter-logs-otlp-http": "0.222.0",
        "@opentelemetry/exporter-metrics-otlp-http": "0.222.0",
        "@opentelemetry/exporter-trace-otlp-http": "0.222.0",
        "@opentelemetry/sdk-trace-base": "2.11.0",
        "@opentelemetry/sdk-trace-node": "2.11.0"
      },
      absent: [...runners, ...browserAdapters, "@opentelemetry/sdk-trace-web"],
      imports: ["@smthrs/flows/NodeRuntime", "@smthrs/gateway/node/NodeGateway", "@smthrs/observability/NodeOtel"]
    },
    {
      name: "browser",
      dependencies: {
        "@smthrs/observability": firstParty,
        "@smthrs/platform-browser": firstParty,
        "@opentelemetry/sdk-trace-base": "2.11.0",
        "@opentelemetry/sdk-trace-web": "2.11.0",
        effect
      },
      absent: [
        ...runners,
        ...nodeAdapters,
        "@effect/platform-bun",
        "@smthrs/platform-bun",
        "@opentelemetry/sdk-trace-node",
        ...telemetryAdapters.slice(0, 3)
      ],
      imports: ["@smthrs/observability/BrowserOtel", "@smthrs/platform-browser"]
    },
    {
      name: "bun",
      dependencies: {
        "@smthrs/platform-bun": firstParty,
        "@smthrs/platform-node": firstParty,
        "@effect/platform-bun": effect,
        "@effect/platform-node": effect,
        "@effect/platform-node-shared": effect,
        effect
      },
      absent: [...runners, ...telemetryAdapters, "@effect/sql-sqlite-node", "@smthrs/platform-browser"],
      imports: ["@smthrs/platform-bun", "@smthrs/platform-bun/BunFileSystem", "@smthrs/platform-bun/BunHost"]
    },
  ]
}

export const migrationProfiles = (entries) => {
  const firstParty = candidateVersion(entries)
  return [
    {
      name: "migrate-scan",
      dependencies: {
        "@smthrs/migrate": firstParty,
        "@effect/platform-node": effect,
        "@effect/platform-node-shared": effect,
        effect,
        ["@typescript/typescript-" + process.platform + "-" + process.arch]: "7.0.2"
      },
      omitOptional: true,
      absent: [
        ...runners,
        ...telemetryAdapters,
        ...browserAdapters,
        "@smthrs/agent",
        "@smthrs/engine",
        "@smthrs/harness",
        "@smthrs/registry",
        "@smthrs/flows",
        "@effect/sql-sqlite-node"
      ],
      imports: ["@smthrs/migrate", "@smthrs/migrate/Inventory"]
    },
    {
      name: "migrate-apply",
      dependencies: {
        "@smthrs/migrate": firstParty,
        "@effect/platform-node": effect,
        "@effect/platform-node-shared": effect,
        effect
      },
      required: ["@smthrs/agent", "@smthrs/engine", "@smthrs/harness", "@smthrs/registry", "@smthrs/platform-node"],
      absent: [...runners, ...telemetryAdapters, ...browserAdapters, "@smthrs/flows", "@effect/sql-sqlite-node"],
      imports: ["@smthrs/migrate/flow/Command", "@smthrs/migrate/flow/MigrateFlow", "@smthrs/migrate/flow/Layers"]
    }
  ]
}

/** Only walk package directories and their nested modules; symlinks are not copies. */
export const physicalPackages = (consumer) => {
  const packages = []
  const modules = (directory) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = join(directory, entry.name)
      if (entry.name === ".pnpm") {
        for (const store of readdirSync(path, { withFileTypes: true })) {
          if (store.isDirectory() && store.name !== "node_modules") modules(join(path, store.name, "node_modules"))
        }
      } else if (entry.name.startsWith("@")) {
        modules(path)
      } else if (!entry.name.startsWith(".")) {
        const manifestPath = join(path, "package.json")
        if (existsSync(manifestPath)) {
          packages.push({ manifest: JSON.parse(readFileSync(manifestPath, "utf8")), path: realpathSync(manifestPath) })
        }
        modules(join(path, "node_modules"))
      }
    }
  }
  modules(join(consumer, "node_modules"))
  return packages
}

export const assertConsumerTree = (consumer, profile) => {
  const installed = physicalPackages(consumer)
  const copies = installed.filter(({ manifest }) => manifest.name === "effect")
  assert.equal(copies.length, 1, profile.name + ": expected exactly one physical Effect copy")
  const family = assertEffectFamilyInstalled(consumer, effect)
  assert.equal(copies[0].manifest.version, effect)
  const names = new Set(installed.map(({ manifest }) => manifest.name))
  for (const name of profile.absent ?? []) {
    assert.equal(names.has(name), false, profile.name + ": unrelated " + name + " installed")
  }
  for (const name of [...Object.keys(profile.dependencies), ...(profile.required ?? [])]) {
    assert.equal(names.has(name), true, profile.name + ": missing selected dependency " + name)
  }
  const resolutions = []
  for (const { manifest, path } of installed) {
    if (manifest.name !== "effect" && !manifest.name.startsWith("@smthrs/") && !manifest.name.startsWith("@effect/")) {
      continue
    }
    if (manifest.name !== "effect" && !manifest.dependencies?.effect && !manifest.peerDependencies?.effect) continue
    const selected = realpathSync(createRequire(path).resolve("effect/package.json"))
    assert.equal(selected, copies[0].path, manifest.name + ": Effect resolution differs")
    assert.equal(relative(realpathSync(consumer), selected).startsWith(".."), false, "resolution escaped consumer")
    resolutions.push({ name: manifest.name, path, effect: selected })
  }
  assert.ok(resolutions.length > 0)
  return { count: installed.length, effectFamily: family, effectCopies: copies.map(({ path }) => path), resolutions }
}

/** Record actual exit status and exact command, including expected install refusals. */
export const consumerCommand = (command, args, cwd, options = {}) =>
  new Promise((resolveRun, reject) => {
    const started = Date.now()
    console.log(JSON.stringify({ command, args, cwd, event: "start", at: new Date(started).toISOString() }))
    const child = spawn(command, args, { cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    child.once("error", reject)
    child.once("close", (exit, signal) => {
      console.log(
        JSON.stringify({
          command,
          args,
          cwd,
          node: process.version,
          event: "end",
          at: new Date().toISOString(),
          exit,
          signal,
          durationMs: Date.now() - started
        })
      )
      if (
        exit !== 0 || command.endsWith("/vitest") || args[0] === "--version" || args.includes("--reporter=append-only")
      ) console.log(output)
      resolveRun({ exit, signal, output })
    })
  })

const successful = async (command, args, cwd, options) => {
  const result = await consumerCommand(command, args, cwd, options)
  assert.equal(result.exit, 0, command + " " + args.join(" ") + "\n" + result.output)
  return result
}

/** CLI alone, with fresh third-party resolution under each supported package manager. */
export const runCliMcpConsumer = async (manager, registryUrl, cliVersion, { env = process.env } = {}) => {
  assert.ok(manager === "npm" || manager === "pnpm", "Unsupported release package manager: " + manager)
  const consumer = await mkdtemp(join(tmpdir(), "smthrs-release-mcp-" + manager + "-"))
  try {
    await writeFile(join(consumer, ".npmrc"), "@smthrs:registry=" + registryUrl + "\n")
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify(
        {
          private: true,
          packageManager: releasePackageManager,
          dependencies: { "@smthrs/cli": cliVersion }
        },
        null,
        2
      ) + "\n"
    )
    const managerVersion = (await successful(manager, ["--version"], consumer)).output.trim()
    const flags = manager === "npm"
      ? ["--no-audit", "--no-fund", "--cache", join(consumer, ".empty-npm-cache")]
      : [
        "--store-dir",
        join(consumer, ".empty-pnpm-store"),
        "--cache-dir",
        join(consumer, ".empty-pnpm-cache"),
        "--package-import-method=hardlink",
        "--reporter=append-only"
      ]
    await successful(manager, ["install", "--ignore-scripts", ...flags], consumer)
    const tree = assertConsumerTree(consumer, {
      name: "cli-only-" + manager,
      dependencies: { "@smthrs/cli": cliVersion },
      absent: ["@effect/platform-node", "@effect/platform-node-shared", "@effect/platform-bun"]
    })
    const serverInfo = await mcpInitialize(join(consumer, "node_modules/.bin/smthrs"), ["--mcp"], {
      cwd: consumer,
      env: { ...env, HOME: consumer, XDG_CONFIG_HOME: consumer, XDG_DATA_HOME: consumer }
    })
    assert.equal(serverInfo.version, cliVersion, "installed MCP version differs from candidate")
    // Follow the public CLI type through its internal composition to registry
    // metadata. A stale sibling declaration or an erased `any` must fail here.
    const body = [
      "const accountPool = NodeControl.accountPoolDefaultModel",
      "const snapshot = (engine: NodeControl.EngineDurable): ReadonlyArray<string> =>",
      "  engine.host.catalog?.executables.map(({ descriptor }) => {",
      "    const input = descriptor.input",
      "    // @ts-expect-error Nested declarations must retain actual fields rather than any.",
      "    void descriptor.missingConsumerField",
      "    return input?._tag === \"Module\" ? JSON.stringify(input.document ?? null) : descriptor.name",
      "  }) ?? []",
      "void accountPool; void snapshot",
      ""
    ].join("\n")
    await writeFile(
      join(consumer, "cli-consumer.mts"),
      "import * as NodeControl from \"@smthrs/cli/NodeControl\"\n" + body
    )
    await writeFile(
      join(consumer, "cli-consumer.cts"),
      "import NodeControl = require(\"@smthrs/cli/NodeControl\")\n" + body
    )
    const requireCli = createRequire(realpathSync(join(consumer, "node_modules/@smthrs/cli/package.json")))
    const compiler = requireCli.resolve("typescript/bin/tsc")
    const nodeTypesPath = createRequire(requireCli.resolve("@types/ws/package.json")).resolve(
      "@types/node/package.json"
    )
    const nodeTypesManifest = await readFile(nodeTypesPath)
    const nodeTypes = {
      path: nodeTypesPath,
      version: JSON.parse(nodeTypesManifest).version,
      manifestSha256: createHash("sha256").update(nodeTypesManifest).digest("hex"),
      indexSha256: createHash("sha256").update(await readFile(join(dirname(nodeTypesPath), "index.d.ts"))).digest("hex")
    }
    // Match the Node >=26 runtime contract, including require(ESM). Select the
    // Node ambient types from the actual published dependency graph so npm's
    // unrelated hoisted @types packages cannot define the consumer environment.
    for (const module of ["Node20", "NodeNext"]) {
      await successful(process.execPath, [
        compiler,
        "--noEmit",
        "--strict",
        "--module",
        module,
        "--moduleResolution",
        "NodeNext",
        "--types",
        "node",
        "--typeRoots",
        dirname(dirname(nodeTypesPath)),
        "--target",
        "ES2022",
        "cli-consumer.mts",
        "cli-consumer.cts"
      ], consumer)
    }
    return { manager, managerVersion, serverInfo, tree, nodeTypes, declarations: ["ESM", "CJS", "Node20", "NodeNext"] }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

export const runConsumerProfile = async (profile, manager, registryUrl, { runtime = false } = {}) => {
  const consumer = await mkdtemp(join(tmpdir(), "smithers-k-consumer-" + manager + "-" + profile.name + "-"))
  try {
    await writeFile(join(consumer, ".npmrc"), "@smthrs:registry=" + registryUrl + "\n")
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        name: "dependency-profile",
        version: "1.0.0",
        private: true,
        type: "module",
        smthrsReleaseConsumer: true,
        packageManager: releasePackageManager,
        dependencies: profile.dependencies
      })
    )
    const managerVersion = (await successful(manager, ["--version"], consumer)).output.trim()
    const args = [
      "install",
      "--ignore-scripts",
      ...consumerCacheFlags(manager),
      ...(manager === "npm" ? ["--no-audit", "--no-fund", "--strict-peer-deps"] : ["--strict-peer-dependencies"])
    ]
    if (profile.omitOptional) args.push(manager === "npm" ? "--omit=optional" : "--no-optional")
    await successful(manager, args, consumer)
    const tree = assertConsumerTree(consumer, profile)
    if (runtime) {
      await writeFile(join(consumer, "dependency-resolutions.json"), JSON.stringify(tree.resolutions))
      for (const mode of ["esm", "cjs"]) {
        const source = mode === "esm"
          ? "for (const name of " + JSON.stringify(profile.imports) + ") await import(name)"
          : "for (const name of " + JSON.stringify(profile.imports) + ") require(name)"
        await successful(
          process.execPath,
          [...(mode === "esm" ? ["--input-type=module"] : []), "--eval", source],
          consumer
        )
      }
      const fixture = join(installedConsumerDirectory, "dependency-adapters.mjs")
      await writeFile(
        join(consumer, "consumer-boundary.mjs"),
        await readFile(join(installedConsumerDirectory, "consumer-boundary.mjs"))
      )
      await writeFile(join(consumer, "dependency-adapters.mjs"), await readFile(fixture))
      await successful(process.execPath, ["dependency-adapters.mjs", profile.name], consumer)
      if (profile.name === "browser") {
        await bundle({
          absWorkingDir: consumer,
          bundle: true,
          platform: "browser",
          write: false,
          logLevel: "silent",
          stdin: {
            contents:
              "import * as BrowserOtel from \"@smthrs/observability/BrowserOtel\"; globalThis.adapter = BrowserOtel",
            resolveDir: consumer
          }
        })
      }
      if (profile.name === "bun") await successful("bun", ["dependency-adapters.mjs", profile.name], consumer)
    }
    console.log(
      "consumer ok " + manager + " " + profile.name + ": " + tree.count + " packages; one Effect; " +
        (profile.absent?.length ?? 0) + " absent adapters"
    )
    return { manager, managerVersion, profile: profile.name, ...tree }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

/**
 * The published Flows quickstart as a stranger meets it: the commands of its
 * set-up block, the program its `ts` blocks paste together, the command that
 * runs it and the line it prints. Read from the page, never restated here, so
 * the page and the gate cannot disagree.
 */
export const readQuickstart = (root = repoRoot) => {
  const source = readFileSync(join(root, "packages/smithers/flows/docs/quickstart.md"), "utf8")
  const fenced = (language) =>
    [...source.matchAll(new RegExp("^```" + language + "\\n([\\s\\S]*?)^```$", "gm"))].map(([, body]) => body.trimEnd())
  const [setup, run, ...extra] = fenced("bash")
  const printed = fenced("text")
  assert.ok(setup !== undefined && run !== undefined && extra.length === 0, "quickstart needs a set-up block and a run block")
  assert.equal(printed.length, 1, "quickstart must show the one line the program prints")
  const [enter, ...commands] = setup.split("\n")
  assert.match(enter, /^mkdir (\S+) && cd \1$/, "quickstart must start in a new, empty directory")
  const installs = commands.filter((command) => command.startsWith("npm install "))
  assert.equal(installs.length, 1, "quickstart must give exactly one install line")
  return {
    commands,
    install: installs[0],
    packages: installs[0].split(" ").slice(2),
    program: fenced("ts").join("\n\n") + "\n",
    run: run.split(" "),
    printed: printed[0]
  }
}

/** Package names a program imports, without its relative and `node:` specifiers. */
export const importedPackages = (program) => [
  ...new Set(
    [...program.matchAll(/\bfrom\s+"([^"./][^"]*)"/g)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => !specifier.startsWith("node:"))
      .map((specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/"))
  )
].sort()

/**
 * The install line plus the pasted quickstart, from an empty directory (#3838).
 * Nothing is preinstalled: the project declares exactly what the install line
 * names, so a package the program reaches only through an optional peer fails
 * here the way it fails for a stranger. The second run proves the replay the
 * page promises by changing the file the first run read. `env` is the smoke's
 * CLI environment: a final pack runs on its own packaged native helper, and a
 * pre-helper rehearsal on the configured source helper.
 */
export const runQuickstartConsumer = async (
  manager,
  registryUrl,
  { quickstart = readQuickstart(), env = process.env } = {}
) => {
  assert.ok(manager === "npm" || manager === "pnpm", "Unsupported release package manager: " + manager)
  const consumer = await mkdtemp(join(tmpdir(), "smthrs-release-quickstart-" + manager + "-"))
  try {
    await writeFile(join(consumer, ".npmrc"), "@smthrs:registry=" + registryUrl + "\n")
    const managerVersion = (await successful(manager, ["--version"], consumer)).output.trim()
    // The page says a pnpm project runs `pnpm add` with the same packages.
    const installed = [manager, manager === "npm" ? "install" : "add", ...quickstart.packages]
    for (const command of quickstart.commands) {
      if (command !== quickstart.install) {
        await successful("sh", ["-c", command], consumer)
        continue
      }
      if (manager === "pnpm") await successful("npm", ["pkg", "set", "packageManager=" + releasePackageManager], consumer)
      await successful(manager, [
        ...installed.slice(1),
        "--ignore-scripts",
        ...consumerCacheFlags(manager),
        ...(manager === "npm" ? ["--no-audit", "--no-fund"] : [])
      ], consumer)
    }
    const declared = Object.keys(JSON.parse(await readFile(join(consumer, "package.json"), "utf8")).dependencies).sort()
    const named = quickstart.packages.map((spec) => spec.slice(0, spec.lastIndexOf("@"))).sort()
    assert.deepEqual(declared, named, "the project declares exactly the packages on the install line")
    await writeFile(join(consumer, "quickstart.ts"), quickstart.program)
    const [command, ...args] = quickstart.run
    assert.equal(command, "node", "the quickstart runs under node")
    const runs = []
    for (const attempt of ["first run", "second run"]) {
      const result = await captureProcess(process.execPath, args, consumer, { timeoutMs: 120_000, env })
      assert.equal(result.ok, true, manager + " quickstart " + attempt + " failed:\n" + result.output)
      assert.equal(result.output.trim(), quickstart.printed, manager + " quickstart " + attempt + " printed something else")
      runs.push(result.output.trim())
      // A replayed step answers from the journal, so the next run must not see this.
      await writeFile(join(consumer, "workspace/note.txt"), "changed after the " + attempt + "\n")
    }
    console.log("quickstart ok " + manager + " " + managerVersion + ": " + installed.join(" ") + "; printed and replayed")
    return { manager, managerVersion, install: installed.join(" "), declared, runs }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

export const refuseIncompatibleRc = async (manager, registryUrl, entries) => {
  const firstParty = candidateVersion(entries)
  const consumer = await mkdtemp(join(tmpdir(), "smithers-k-incompatible-" + manager + "-"))
  try {
    await writeFile(join(consumer, ".npmrc"), "@smthrs:registry=" + registryUrl + "\n")
    // Adjacent published RC, deliberately incompatible with the exact library peer.
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        packageManager: releasePackageManager,
        dependencies: { "@smthrs/database": firstParty, effect: adjacentEffectVersion }
      })
    )
    await successful(manager, ["--version"], consumer)
    const result = await consumerCommand(manager, [
      "install",
      "--ignore-scripts",
      ...consumerCacheFlags(manager),
      ...(manager === "npm" ? ["--strict-peer-deps", "--no-audit", "--no-fund"] : ["--strict-peer-dependencies"])
    ], consumer)
    assert.notEqual(result.exit, 0, "incompatible RC must be refused")
    assert.equal(result.signal, null)
    assert.match(result.output, manager === "npm" ? /ERESOLVE/ : /ERR_PNPM_PEER_DEP_ISSUES/)
    assert.match(result.output, literally(effect))
    assert.match(result.output, literally(adjacentEffectVersion))
    return { manager, exit: result.exit }
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

export const runConsumerMatrix = async (directory, entries, {
  profiles = minimalProfiles(entries),
  managers = ["npm", "pnpm"],
  runtime = false,
  // The published quickstart runs wherever the candidate's code does.
  quickstart = runtime,
  env = process.env
} = {}) => {
  const registry = await releaseRegistry(directory, entries)
  const results = []
  const failures = []
  try {
    for (const manager of managers) {
      for (const profile of profiles) {
        try {
          results.push(await runConsumerProfile(profile, manager, registry.url, { runtime }))
        } catch (cause) {
          const error = new Error(manager + " " + profile.name + ": " + cause.message, { cause })
          failures.push(error)
          console.error(error.message)
        }
      }
      try {
        results.push({ incompatible: await refuseIncompatibleRc(manager, registry.url, entries) })
      } catch (cause) {
        failures.push(new Error(manager + " incompatible RC: " + cause.message, { cause }))
      }
      if (quickstart) {
        try {
          results.push({ quickstart: await runQuickstartConsumer(manager, registry.url, { env }) })
        } catch (cause) {
          const error = new Error(manager + " quickstart: " + cause.message, { cause })
          failures.push(error)
          console.error(error.message)
        }
      }
    }
    console.log(JSON.stringify({
      consumerMatrix: {
        profilesPassed: results.filter((result) => result.profile !== undefined).length,
        incompatibleRefusals: results.filter((result) => result.incompatible !== undefined).length,
        quickstartsPassed: results.filter((result) => result.quickstart !== undefined).length,
        failures: failures.length
      },
      node: process.version
    }))
    if (failures.length) throw new AggregateError(failures, failures.length + " consumer profiles failed")
    return results
  } finally {
    await registry.close()
  }
}

if (isMain(import.meta)) {
  const directory = resolve(process.argv[2])
  const entries = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))
  await runConsumerMatrix(directory, entries, {
    profiles: [
      ...minimalProfiles(entries),
      ...adapterProfiles(entries),
      ...migrationProfiles(entries),
    ],
    runtime: true
  })
}
