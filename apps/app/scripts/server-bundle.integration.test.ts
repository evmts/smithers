import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { runBundleCommand, validateBuildSHA, verifyBundleManifest } from "./bundle-manifest"

// Explicit assembly gate: startup and VM checks are owned by T-INS-02.
export const verifyRelocatedLayout = (root: string): void => {
  root = realpathSync(root)
  verifyBundleManifest(root)
  for (const file of ["bin/smithers-backend", "bin/node", "bin/git", "bin/jj", "bin/smithers-coding-host", "bin/smithers-model-host", "bin/flow-hosts.json", "bin/linux-arm64/smithers-jj-export", "bin/libsmithers_ffi.dylib", "views/mainview/index.html", "postgres/bundle.json", "bin/smithers-server", "bin/msb", "lib/libkrunfw.5.dylib", "share/microsandbox/smithers-guest.py", "share/microsandbox/base-image.oci.tar", "share/microsandbox/base-image.json", "manifest.json"]) {
    assert(existsSync(join(root, file)), `Missing bundle payload: ${file}`)
  }
  const linuxHelper = readFileSync(join(root, "bin/linux-arm64/smithers-jj-export"))
  assert.equal(linuxHelper.subarray(0, 6).toString("hex"), "7f454c460201", "Guest helper must be ELF64 little-endian")
  assert.equal(linuxHelper.readUInt16LE(18), 183, "Guest helper must be arm64")
  const image = JSON.parse(readFileSync(join(root, "share/microsandbox/base-image.json"), "utf8")) as { image: string; archive: string; sha256: string }
  assert.match(image.image, /@sha256:[0-9a-f]{64}$/)
  assert.equal(image.archive, "base-image.oci.tar")
  assert.equal(createHash("sha256").update(readFileSync(join(root, "share/microsandbox", image.archive))).digest("hex"), image.sha256)
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const file = join(directory, name)
      if (lstatSync(file).isDirectory()) { visit(file); continue }
      assert(!relative(root, realpathSync(file)).startsWith(".."), `Escaping payload: ${file}`)
      const bytes = readFileSync(file)
      assert(!bytes.includes(Buffer.from(homedir())), `Developer home reference: ${relative(root, file)}`)
      const magic = bytes.subarray(0, 4).toString("hex")
      if (!["cffaedfe", "feedfacf", "cafebabe", "bebafeca"].includes(magic)) continue
      const run = (args: string[]): string => {
        const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" })
        assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr))
        return new TextDecoder().decode(result.stdout)
      }
      const identities = run(["/usr/bin/otool", "-D", file]).split("\n").slice(1).map((line) => line.trim())
      const rpaths = Array.from(run(["/usr/bin/otool", "-l", file]).matchAll(/cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.*?) \(offset/g), (match) => match[1]!)
      for (const line of run(["/usr/bin/otool", "-L", file]).split("\n").slice(1)) {
        const library = line.trim().split(" (compatibility", 1)[0]!
        if (!library || library.endsWith(":") || identities.includes(library)) continue
        if (library.startsWith("/usr/lib/") || library.startsWith("/System/Library/")) continue
        assert(!isAbsolute(library), `Absolute library: ${library}`)
        const expand = (value: string) => value.replace("@loader_path", dirname(file)).replace("@executable_path", join(root, "bin"))
        const candidates = library.startsWith("@rpath/") ? rpaths.map((path) => resolve(expand(path), library.slice(7))) : [resolve(expand(library))]
        assert(candidates.some((path) => existsSync(path) && !relative(root, realpathSync(path)).startsWith("..")), `Unresolved library: ${library} (${file})`)
      }
    }
  }
  visit(root)
}

if (import.meta.main && process.argv.includes("--run")) {
  assert.equal(process.platform, "darwin")
  assert.equal(process.arch, "arm64")
  const revision = validateBuildSHA(process.env.SMITHERS_BUILD_SHA)
  const root = resolve(import.meta.dir, "../../..")
  const temporary = mkdtempSync(join(tmpdir(), "smithers-assembly-"))
  try {
    const checkout = join(temporary, "checkout")
    const run = (args: string[], cwd = root) => runBundleCommand(args[0]!, args, {
      cwd, env: { ...process.env, SMITHERS_BUILD_SHA: revision }
    })
    await run(["jj", "git", "clone", "--colocate", "--depth", "1", root, checkout])
    await run(["jj", "new", revision], checkout)
    await run(["pnpm", "install", "--offline", "--frozen-lockfile"], checkout)
    await run(["pnpm", "exec", "smthrs", "build", "//apps/app:serverBundle", "--verbose"], checkout)
    const helper = readFileSync(join(checkout, "packages/backend/microsandbox/guest/smithers-guest.py"))
    assert.deepEqual(readFileSync(join(checkout, "apps/app/.server-bundle/share/microsandbox/smithers-guest.py")), helper)
    assert(readFileSync(join(checkout, "apps/app/.server-bundle/bin/smithers-backend")).includes(helper), "Backend embedded helper differs from the packaged helper")
    const relocated = join(temporary, "relocated")
    mkdirSync(relocated)
    cpSync(join(checkout, "apps/app/.server-bundle"), relocated, { recursive: true })
    rmSync(checkout, { recursive: true, force: true })
    verifyRelocatedLayout(relocated)
    console.log("C-INS-05 assembly/layout/digest/relocation PASS")
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}
