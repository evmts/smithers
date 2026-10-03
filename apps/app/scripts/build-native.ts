import { compileServerLauncher, createBundleManifest, runBundleCommand, materializeBundleFileLinks, validateBuildSHA, validateNodeVersion, validateMsbVersion, validatePostgresVersion, verifyBundleManifest } from "./bundle-manifest"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs"
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path"
import { bundlePostgres } from "./bundle-postgres"
import { foreignLibraries } from "./system-linkage"
import { validateGitBundle } from "./validate-git-bundle"

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("The server bundle must be built on darwin-arm64.")
const appDir = resolve(import.meta.dir, "..")
const root = resolve(appDir, "..", "..")
const revision = validateBuildSHA(process.env.SMITHERS_BUILD_SHA?.trim())
const nativeDir = join(appDir, ".server-bundle")
const jjRevision = "47589ada70c12b3e829b5c98ab32503abad49eac"
const jjVersion = `jj 0.44.0-${jjRevision}`
const configuredCargoTarget = process.env.CARGO_TARGET_DIR?.trim()
const cargoTargetDir = configuredCargoTarget
  ? resolve(root, configuredCargoTarget)
  : join(root, "target")
const configuredNode = process.env.SMITHERS_NODE_BINARY?.trim()
const discoveredNode = configuredNode === undefined || configuredNode === ""
  ? Bun.which("node")
  : isAbsolute(configuredNode) ? configuredNode : Bun.which(configuredNode)
if (discoveredNode === null || discoveredNode === undefined) {
  throw new Error("SMITHERS_NODE_BINARY must name a build-time Node 26.4+ executable.")
}
const nodeBinary = realpathSync(discoveredNode)
const nodeVersion = Bun.spawnSync([nodeBinary, "--version"], { stdout: "pipe", stderr: "pipe" })
if (nodeVersion.exitCode !== 0) throw new Error("Node version probe failed.")
validateNodeVersion(new TextDecoder().decode(nodeVersion.stdout).trim())
// The app ships this binary, so it must run on a Mac without the build
// machine's package manager. The nodejs.org build links only macOS.
const foreignNodeLibraries = foreignLibraries(nodeBinary)
if (foreignNodeLibraries.length > 0) {
  throw new Error(
    `SMITHERS_NODE_BINARY must link only macOS system libraries: ${nodeBinary} loads ${foreignNodeLibraries.join(", ")}`
  )
}
// Node 26 ships no corepack, so the pinned pnpm comes from PATH and must be
// exactly the release the root package.json declares.
const pnpmPin = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager: string }).packageManager
const discoveredPnpm = existsSync(join(dirname(nodeBinary), "pnpm")) ? join(dirname(nodeBinary), "pnpm") : Bun.which("pnpm")
if (discoveredPnpm === null || discoveredPnpm === undefined || (statSync(discoveredPnpm).mode & 0o111) === 0) {
  throw new Error(`The native build needs an executable ${pnpmPin} beside the selected Node or on PATH.`)
}
const pnpmBinary = discoveredPnpm
const pnpmVersion = Bun.spawnSync([pnpmBinary, "--version"], { stdout: "pipe", stderr: "pipe" })
if (pnpmVersion.exitCode !== 0 || `pnpm@${new TextDecoder().decode(pnpmVersion.stdout).trim()}` !== pnpmPin) {
  throw new Error(`The native build needs ${pnpmPin}: ${pnpmBinary}`)
}
const nodeLicense = join(dirname(dirname(nodeBinary)), "LICENSE")
if (!existsSync(nodeLicense)) throw new Error(`Node license is unavailable: ${nodeLicense}`)
const nodeEnvironment = {
  PATH: process.env.PATH === undefined || process.env.PATH === ""
    ? dirname(nodeBinary)
    : `${dirname(nodeBinary)}${delimiter}${process.env.PATH}`
}

const output = (argv: ReadonlyArray<string>, env = process.env): string => {
  const result = Bun.spawnSync([...argv], { stdout: "pipe", stderr: "pipe", env })
  if (result.exitCode !== 0) {
    throw new Error(`${argv.join(" ")} failed: ${new TextDecoder().decode(result.stderr).trim()}`)
  }
  return new TextDecoder().decode(result.stdout).trim()
}
const withoutGitOverrides = Object.fromEntries(
  Object.entries(process.env).filter(([name, value]) =>
    value !== undefined && name !== "GIT_EXEC_PATH" && name !== "GIT_TEMPLATE_DIR")
) as Record<string, string>
const configuredGit = process.env.SMITHERS_GIT_BINARY?.trim()
const discoveredGit = configuredGit
  ? isAbsolute(configuredGit) ? configuredGit : Bun.which(configuredGit)
  : process.platform === "darwin"
  ? output(["/usr/bin/xcrun", "--find", "git"], withoutGitOverrides)
  : Bun.which("git")
if (discoveredGit === null || discoveredGit === undefined || discoveredGit === "") {
  throw new Error("SMITHERS_GIT_BINARY must name an executable Git installation.")
}
const gitBinary = realpathSync(discoveredGit)
const gitVersion = output([gitBinary, "--version"], withoutGitOverrides)
if (!/^git version \d+\.\d+/.test(gitVersion)) throw new Error("The selected Git installation returned an invalid version.")
const gitExecSource = realpathSync(output([gitBinary, "--exec-path"], withoutGitOverrides))
const gitPrefix = resolve(gitExecSource, "..", "..")
const gitShareSource = join(gitPrefix, "share", "git-core")
if (!existsSync(gitShareSource)) throw new Error(`Git resources are unavailable: ${gitShareSource}`)

const checksumFile = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex")
const verifyChecksumSidecar = (path: string): void => {
  const expected = `${checksumFile(path)}  ${basename(path)}\n`
  if (readFileSync(`${path}.sha256`, "utf8") !== expected) {
    throw new Error(`Packaged checksum is invalid: ${path}.sha256`)
  }
}
const rustPathFlags = [
  `--remap-path-prefix=${root}=smithers`,
  ...(process.env.HOME ? [`--remap-path-prefix=${process.env.HOME}=build-home`] : [])
]
const run = (
  label: string, argv: ReadonlyArray<string>, cwd = root,
  extraEnv: Readonly<Record<string, string>> = {}
): Promise<void> => runBundleCommand(label, argv, {
  cwd, env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: rustPathFlags.join("\x1f"), ...extraEnv }
})

const postgresBundle = process.env.SMITHERS_POSTGRES_BUNDLE_DIR?.trim() || output(["brew", "--prefix", "postgresql@18"])
if (!postgresBundle) {
  throw new Error(
    "SMITHERS_POSTGRES_BUNDLE_DIR must name a build-time PostgreSQL 18 distribution; native launch never downloads binaries."
  )
}
const postgresBin = join(postgresBundle, "bin")
for (const tool of ["postgres", "initdb", "pg_isready", "psql", "pg_dump", "pg_restore"]) {
  const path = join(postgresBin, tool)
  if (!existsSync(path) || (statSync(path).mode & 0o111) === 0) {
    throw new Error(`PostgreSQL bundle is missing bin/${tool}.`)
  }
}
const version = Bun.spawnSync([join(postgresBin, "postgres"), "--version"], {
  stdout: "pipe",
  stderr: "pipe"
})
if (version.exitCode !== 0) throw new Error("PostgreSQL version probe failed.")
validatePostgresVersion(new TextDecoder().decode(version.stdout).trim())
if (!existsSync(join(root, "crates", "smithers-ffi", "Cargo.toml"))) {
  throw new Error("crates/smithers-ffi is required for the native distribution.")
}

const jjCache = join(root, ".artifacts", "server-bundle-build", `jj-${jjRevision}`)
mkdirSync(dirname(jjCache), { recursive: true })
const previousJj = join(nativeDir, "bin", "jj")
if (existsSync(previousJj) && output([previousJj, "--version"]) === jjVersion && !readFileSync(previousJj).includes(Buffer.from("/Users/"))) cpSync(previousJj, jjCache)
rmSync(nativeDir, { recursive: true, force: true })
mkdirSync(join(nativeDir, "bin"), { recursive: true })
mkdirSync(join(nativeDir, "licenses"), { recursive: true })
const wasm = join(root, "packages", "smithers", "flows", "jj", "wasm", "flows_jj.wasm")
if (!existsSync(wasm) || statSync(wasm).size === 0) {
  throw new Error("The canonical flows_jj.wasm artifact is missing.")
}
await run("pinned Rust toolchain", ["rustup", "toolchain", "install"])
console.log("[build-native] canonical jj WebAssembly: using verified linux/amd64 artifact")
await run("native FFI", ["cargo", "build", "--locked", "--release", "--package", "smithers-ffi"])
const jjInstallRoot = join(nativeDir, ".jj-install")
if (!existsSync(jjCache) || output([jjCache, "--version"]) !== jjVersion || readFileSync(jjCache).includes(Buffer.from("/Users/"))) {
  await run(
    "pinned jj CLI",
    [
      "cargo", "install", "--locked",
      "--git", "https://github.com/smithersai/jj.git", "--rev", jjRevision,
      "--root", jjInstallRoot, "jj-cli"
    ],
    root,
    { NIX_JJ_GIT_HASH: jjRevision }
  )
  cpSync(join(jjInstallRoot, "bin", "jj"), jjCache)
}
const installedJj = jjCache
if (output([installedJj, "--version"]) !== jjVersion) throw new Error(`Native releases require ${jjVersion}.`)
cpSync(installedJj, join(nativeDir, "bin", "jj"))
rmSync(jjInstallRoot, { recursive: true, force: true })
await run(
  "Go backend",
  ["sh", "scripts/build-backend.sh", join(nativeDir, "bin", "smithers-backend"), revision]
)
await run("Node buildchain", [nodeBinary, "--version"], root, nodeEnvironment)
await run("pinned pnpm buildchain", [pnpmBinary, "--version"], root, nodeEnvironment)
const codingHost = join(nativeDir, "bin", "smithers-coding-host")
await run(
  "canonical coding host",
  [
    nodeBinary,
    "flows/coding/build.mjs",
    codingHost
  ],
  root,
  nodeEnvironment
)
const modelHost = join(nativeDir, "bin", "smithers-model-host")
await run("canonical model host", [nodeBinary, "apps/model-host/build.mjs", modelHost], root, nodeEnvironment)
verifyChecksumSidecar(modelHost)
let linuxHelper = process.env.SMITHERS_LINUX_ARM64_JJ_EXPORT_BINARY?.trim()
if (!linuxHelper) {
  await run("Linux Rust standard library", ["rustup", "target", "add", "aarch64-unknown-linux-musl"])
  const rustSysroot = output(["rustc", "--print", "sysroot"])
  const linuxLinker = join(rustSysroot, "lib", "rustlib", "aarch64-apple-darwin", "bin", "rust-lld")
  if (!existsSync(linuxLinker)) throw new Error("Pinned Rust toolchain is missing rust-lld.")
  await run("Linux arm64 helper", ["cargo", "build", "--locked", "--release", "--package", "smithers-ffi", "--bin", "smithers-jj-export", "--target", "aarch64-unknown-linux-musl"], root, {
    CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER: linuxLinker,
    CARGO_ENCODED_RUSTFLAGS: [...rustPathFlags, "-C", "linker-flavor=ld.lld", "-C", "target-feature=+crt-static"].join("\x1f")
  })
  linuxHelper = join(cargoTargetDir, "aarch64-unknown-linux-musl", "release", "smithers-jj-export")
}
if (!isAbsolute(linuxHelper) || !existsSync(linuxHelper) || statSync(linuxHelper).size === 0) {
  throw new Error("Native builds require an absolute Linux arm64 smithers-jj-export binary.")
}
const packagedLinuxHelper = join(nativeDir, "bin", "linux-arm64", "smithers-jj-export")
mkdirSync(dirname(packagedLinuxHelper), { recursive: true })
cpSync(linuxHelper, packagedLinuxHelper)
await run(
  "Flow host manifest",
  [
    nodeBinary,
    "distribution/flow-host-manifest.mjs",
    join(nativeDir, "bin", "flow-hosts.json"),
    codingHost,
    packagedLinuxHelper
  ],
  root,
  nodeEnvironment
)

// Canonical host artifacts are executable ESM with `#!/usr/bin/env node`.
// Ship the validated Node 26 build runtime and its license. An installed app
// never depends on Homebrew, nvm, or a runtime download.
const hostRuntime = join(nativeDir, "bin", "node")
cpSync(nodeBinary, hostRuntime)
cpSync(nodeLicense, join(nativeDir, "licenses", "node-LICENSE"))
cpSync(join(root, "distribution", "licenses", "jj-LICENSE"), join(nativeDir, "licenses", "jj-LICENSE"))
cpSync(join(root, "distribution", "licenses", "git-COPYING"), join(nativeDir, "licenses", "git-COPYING"))
await run("packaged coding host", [hostRuntime, codingHost, "--help"])
await run("packaged model host", [hostRuntime, modelHost, "--help"])

const packagedGitRoot = nativeDir
cpSync(gitBinary, join(nativeDir, "bin", "git"))
cpSync(gitExecSource, join(nativeDir, "libexec", "git-core"), {
  recursive: true,
  verbatimSymlinks: true
})
// Xcode links these optional commands into git-core, but the app ships only bin/git.
for (const unused of ["git-shell", "scalar"]) {
  rmSync(join(nativeDir, "libexec", "git-core", unused), { force: true })
}
cpSync(gitShareSource, join(nativeDir, "share", "git-core"), {
  recursive: true,
  verbatimSymlinks: true
})
writeFileSync(join(nativeDir, "share", "build-tools.json"), JSON.stringify({ revision, git: gitVersion, jj: jjVersion }, null, 2) + "\n")
validateGitBundle(nativeDir, [
  join(nativeDir, "bin", "git"),
  join(nativeDir, "libexec", "git-core"),
  join(nativeDir, "share", "git-core")
])
const gitEnvironment = {
  GIT_EXEC_PATH: join(packagedGitRoot, "libexec", "git-core"),
  GIT_TEMPLATE_DIR: join(packagedGitRoot, "share", "git-core", "templates")
}
await run("packaged Git", [join(nativeDir, "bin", "git"), "--version"], root, gitEnvironment)
await run("packaged jj", [join(nativeDir, "bin", "jj"), "--version"])
const toolSmoke = mkdtempSync(join(nativeDir, ".git-jj-smoke-"))
try {
  const packagedGit = join(nativeDir, "bin", "git")
  const packagedJj = join(nativeDir, "bin", "jj")
  await run("packaged Git repository init", [packagedGit, "init", "--quiet"], toolSmoke, gitEnvironment)
  await run("packaged Git owner", [packagedGit, "config", "user.name", "Smithers Package Test"], toolSmoke, gitEnvironment)
  await run("packaged Git email", [packagedGit, "config", "user.email", "package-test@smithers.invalid"], toolSmoke, gitEnvironment)
  writeFileSync(join(toolSmoke, "README"), "packaged git and jj\n")
  await run("packaged Git add", [packagedGit, "add", "README"], toolSmoke, gitEnvironment)
  await run("packaged Git commit", [packagedGit, "commit", "--quiet", "-m", "package smoke"], toolSmoke, gitEnvironment)
  await run("packaged jj colocated init", [packagedJj, "git", "init", "--colocate"], toolSmoke, gitEnvironment)
  await run("packaged jj workspace read", [packagedJj, "log", "--no-graph", "-r", "@", "-T", "commit_id"], toolSmoke, gitEnvironment)
} finally {
  rmSync(toolSmoke, { recursive: true, force: true })
}

const ffiName = process.platform === "darwin"
  ? "libsmithers_ffi.dylib"
  : process.platform === "linux"
  ? "libsmithers_ffi.so"
  : "smithers_ffi.dll"
const ffi = join(cargoTargetDir, "release", ffiName)
if (!existsSync(ffi)) {
  throw new Error(`Rust build did not produce ${basename(ffi)}.`)
}
const jjExport = join(cargoTargetDir, "release", "smithers-jj-export")
if (!existsSync(jjExport)) {
  throw new Error("Rust build did not produce smithers-jj-export.")
}
cpSync(ffi, join(nativeDir, "bin", ffiName))
await run("FFI library identity", ["/usr/bin/install_name_tool", "-id", `@loader_path/${ffiName}`, join(nativeDir, "bin", ffiName)])
await run("FFI ad-hoc signature", ["/usr/bin/codesign", "--force", "--sign", "-", join(nativeDir, "bin", ffiName)])
cpSync(jjExport, join(nativeDir, "bin", "smithers-jj-export"))
bundlePostgres(postgresBundle, join(nativeDir, "postgres"))
const pgRoot = join(nativeDir, "postgres")
const pgManifest = JSON.parse(readFileSync(join(pgRoot, "bundle.json"), "utf8")) as { bin: string }
renameSync(dirname(join(pgRoot, pgManifest.bin)), join(pgRoot, "runtime"))
rmSync(join(pgRoot, "root"), { recursive: true, force: true })
rmSync(join(pgRoot, "runtime", "INSTALL_RECEIPT.json"), { force: true })
rmSync(join(pgRoot, "runtime", ".brew"), { recursive: true, force: true })
writeFileSync(join(pgRoot, "bundle.json"), JSON.stringify({ version: 1, bin: "runtime/bin" }) + "\n")

await run("web bundle", [pnpmBinary, "run", "build:web", "--outDir", join(nativeDir, "views", "mainview")], appDir, nodeEnvironment)

const stages: Record<string, string> = {
  "bin/jj": "jj", "bin/git": "git", "bin/node": "node-runtime",
  "bin/smithers-backend": "backend", "bin/libsmithers_ffi.dylib": "native-ffi", "bin/smithers-jj-export": "native-ffi",
  "bin/linux-arm64": "linux-arm64-helper", "bin/smithers-coding-host": "coding-host", "bin/smithers-coding-host.sha256": "flow-host-manifest",
  "bin/smithers-model-host": "model-host", "bin/smithers-model-host.sha256": "model-host", "bin/flow-hosts.json": "flow-host-manifest",
  licenses: "licenses", libexec: "git", "share/git-core": "git", "share/build-tools.json": "git-jj-smoke", postgres: "postgres", "views/mainview": "web" }
const copy = (source: string, destination: string, stage: string): void => {
  mkdirSync(dirname(join(nativeDir, destination)), { recursive: true })
  cpSync(source, join(nativeDir, destination), { recursive: true })
  stages[destination] = stage
}
const msbEntry = Bun.resolveSync("microsandbox", join(root, "packages", "smithers", "flows"))
const msbPackage = dirname(Bun.resolveSync("@superradcompany/microsandbox-darwin-arm64/package.json", dirname(msbEntry)))
const requiredVersion = /const RequiredVersion = "([^"]+)"/.exec(readFileSync(join(root, "packages", "backend", "microsandbox", "cli.go"), "utf8"))?.[1]
if (requiredVersion !== "0.6.16") throw new Error("The assembler's Microsandbox pin differs from the backend's RequiredVersion.")
validateMsbVersion(output([join(msbPackage, "bin", "msb"), "--version"]), requiredVersion)
copy(join(msbPackage, "bin", "msb"), "bin/msb", "microsandbox")
copy(join(msbPackage, "lib", "libkrunfw.5.dylib"), "lib/libkrunfw.5.dylib", "microsandbox")
copy(join(root, "packages", "backend", "microsandbox", "guest", "smithers-guest.py"), "share/microsandbox/smithers-guest.py", "guest-helper")
const image = /const DefaultImage = "([^"]+)"/.exec(readFileSync(join(root, "packages", "backend", "microsandbox", "runtime.go"), "utf8"))?.[1]
if (!image || !/@sha256:[0-9a-f]{64}$/.test(image)) throw new Error("The guest base image must be digest-pinned.")
const imageArchive = join(nativeDir, "share", "microsandbox", "base-image.oci.tar")
const imageEnv = { HOME: join(nativeDir, ".image-home"), MSB_BACKEND: "local" }
mkdirSync(imageEnv.HOME, { recursive: true })
await run("pinned guest image", [join(nativeDir, "bin", "msb"), "image", "pull", image], root, imageEnv)
await run("guest OCI archive", [join(nativeDir, "bin", "msb"), "image", "save", "--format", "oci", "--output", imageArchive, image], root, imageEnv)
stages["share/microsandbox/base-image.oci.tar"] = "guest-image"
writeFileSync(join(nativeDir, "share", "microsandbox", "base-image.json"), `${JSON.stringify({ image, archive: "base-image.oci.tar", sha256: checksumFile(imageArchive) })}\n`)
stages["share/microsandbox/base-image.json"] = "guest-image"

rmSync(join(nativeDir, ".image-home"), { recursive: true, force: true })
await compileServerLauncher(join(appDir, "src/bun/serve.ts"), join(nativeDir, "bin/smithers-server"))
stages["bin/smithers-server"] = "launcher"
materializeBundleFileLinks(nativeDir)
writeFileSync(join(nativeDir, "manifest.json"), JSON.stringify(createBundleManifest(nativeDir, revision, stages), null, 2) + "\n")
verifyBundleManifest(nativeDir)
