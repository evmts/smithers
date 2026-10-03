import { createHash } from "node:crypto"
import { cpSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

export const validateBuildSHA = (value: string | undefined): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{40,64}$/.test(value)) throw new Error("Server bundle requires an exact SMITHERS_BUILD_SHA.")
  return value
}
export const validateNodeVersion = (value: string): void => {
  const match = /^v26\.(\d+)\.\d+$/.exec(value)
  if (match === null || Number(match[1]) < 4) throw new Error("SMITHERS_NODE_BINARY must name Node 26.4 or a later Node 26.")
}
export const validatePostgresVersion = (value: string): void => {
  if (!/^postgres \(PostgreSQL\) 18\.\d+(?:\.\d+)?(?: \((?:Postgres\.app|Homebrew)\))?$/.test(value)) throw new Error(`The server bundle requires PostgreSQL 18; received ${JSON.stringify(value)}.`)
}
export const validateMsbVersion = (value: string, requiredVersion = "0.6.16"): void => {
  if (value !== `msb ${requiredVersion}`) throw new Error(`The server bundle requires msb ${requiredVersion}.`)
}
export interface BundleManifest {
  readonly version: 1
  readonly platform: "darwin-arm64"
  readonly revision: string
  readonly files: Record<string, { sha256: string; stage: string }>
}
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex")
const checksumFile = (path: string): string => digest(readFileSync(path))
const inside = (root: string, path: string): boolean => {
  const child = relative(root, path)
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}
const payloadFiles = (root: string): Array<string> => {
  const result: Array<string> = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const info = lstatSync(path)
      if (info.isDirectory()) visit(path)
      else if (info.isFile() || info.isSymbolicLink()) {
        if (path !== join(root, "manifest.json")) result.push(relative(root, path).split(sep).join("/"))
      } else throw new Error(`Unsupported bundle entry: ${path}`)
    }
  }
  visit(root)
  return result
}
const payloadHash = (root: string, path: string): string => {
  const full = join(root, path)
  if (!lstatSync(full).isSymbolicLink()) return checksumFile(full)
  const target = readlinkSync(full)
  if (isAbsolute(target) || !inside(root, resolve(dirname(full), target))) throw new Error(`Bundle symlink escapes: ${path}`)
  // realpath also rejects missing targets, indirect escapes and cycles.
  if (!inside(realpathSync(root), realpathSync(full))) throw new Error(`Bundle symlink escapes: ${path}`)
  return digest(target)
}
/** Publish regular files under ToolBuild's fail-closed output contract. */
export const materializeBundleFileLinks = (root: string): void => {
  for (const path of payloadFiles(root)) {
    const full = join(root, path)
    if (!lstatSync(full).isSymbolicLink()) continue
    payloadHash(root, path) // Refuse absolute, escaping, missing and cyclic links.
    const target = realpathSync(full)
    if (!statSync(target).isFile()) throw new Error(`Bundle link must target a regular file: ${path}`)
    rmSync(full)
    cpSync(target, full)
  }
}

export const createBundleManifest = (root: string, revision: string, stages: Readonly<Record<string, string>>): BundleManifest => {
  validateBuildSHA(revision)
  const files: BundleManifest["files"] = Object.create(null)
  for (const path of payloadFiles(root)) {
    let key = path
    while (!Object.hasOwn(stages, key) && key.includes("/")) key = key.slice(0, key.lastIndexOf("/"))
    const stage = stages[key]
    if (typeof stage !== "string" || stage.trim() === "") throw new Error(`Bundle file has no producing stage: ${path}`)
    files[path] = { sha256: payloadHash(root, path), stage }
  }
  return { version: 1, platform: "darwin-arm64", revision, files }
}
export const verifyBundleManifest = (root: string): void => {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as BundleManifest
  if (manifest === null || manifest.version !== 1 || manifest.platform !== "darwin-arm64" || typeof manifest.files !== "object" || manifest.files === null || Array.isArray(manifest.files)) throw new Error("Invalid bundle manifest.")
  validateBuildSHA(manifest.revision)
  const actual = payloadFiles(root)
  const listed = Object.keys(manifest.files).sort()
  if (JSON.stringify(actual.slice().sort()) !== JSON.stringify(listed)) throw new Error("Bundle manifest file inventory differs from the payload.")
  for (const path of listed) {
    if (isAbsolute(path) || path.split("/").some((part) => part === ".." || part === "." || part === "")) throw new Error(`Unsafe manifest path: ${path}`)
    const entry = manifest.files[path]
    if (entry === null || typeof entry !== "object" || typeof entry.stage !== "string" || entry.stage.trim() === "" || typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`Invalid manifest entry: ${path}`)
    if (entry.sha256 !== payloadHash(root, path)) throw new Error(`Bundle hash mismatch: ${path}`)
  }
}

export const compileServerLauncher = async (entry: string, outfile: string): Promise<void> => {
  const launcherDirectory = dirname(resolve(entry))
  const result = await Bun.build({
    entrypoints: [entry],
    compile: { target: "bun-darwin-arm64", outfile },
    plugins: [{
      name: "relocatable-server-launcher",
      setup(build) {
        build.onLoad({ filter: /(?:^|\/)(?:serve|NativeBackendProcess|server)\.ts$/ }, (args) => {
          if (dirname(resolve(args.path)) !== launcherDirectory) return undefined
          return {
            contents: readFileSync(args.path, "utf8").replaceAll("import.meta.dir", "require('node:path').dirname(process.execPath)"),
            loader: "ts",
          }
        })
      },
    }],
  })
  if (!result.success) throw new Error(`Server launcher compilation failed: ${result.logs.map(String).join("\n")}`)
}


/** The assembler and clean-checkout gate share one process boundary. */
export const runBundleCommand = async (
  label: string, argv: ReadonlyArray<string>, options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<void> => {
  console.log(`[build-native] ${label}: ${argv.join(" ")}`)
  const child = Bun.spawn([...argv], { ...options, stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  const code = await child.exited
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}.`)
}
