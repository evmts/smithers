import { createHash } from "node:crypto"
import { constants, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

/** Public maintained package assets, with this checkout's backend and TS hosts rebuilt. */
export async function prepareNativeProbeAssets() {
  const supplied = process.env.SMITHERS_NATIVE_TEST_ASSETS
  if (!supplied) {
    throw new Error("Set SMITHERS_NATIVE_TEST_ASSETS to a source-matched maintained package Resources/app directory")
  }
  const repository = resolve(import.meta.dir, "../../../..")
  const node = Bun.which("node")
  if (!node) throw new Error("Node 26 is required")
  const root = mkdtempSync(join(tmpdir(), "smithers-native-probe-assets-"))
  const buildEnv = { PATH: process.env.PATH, HOME: process.env.HOME, GOTELEMETRY: "off" }
  const run = async (args: string[]) => {
    const child = Bun.spawn(args, { cwd: repository, env: buildEnv, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${args[0]} failed: ${stderr || stdout}`)
  }
  const stop = () => rm(root, { recursive: true, force: true })
  try {
    for (const directory of ["bin", "postgres", "libexec", "share"]) {
      cpSync(join(supplied, directory), join(root, directory), { recursive: true, mode: constants.COPYFILE_FICLONE })
    }
    const bin = join(root, "bin")
    await run(["go", "build", "-o", join(bin, "smithers-backend"), "./apps/backend"])
    await run([node, "flows/coding/build.mjs", join(bin, "smithers-coding-host")])
    await run([node, "apps/model-host/build.mjs", join(bin, "smithers-model-host")])
    const digest = (name: string) => createHash("sha256").update(readFileSync(join(bin, name))).digest("hex")
    const manifest = JSON.parse(readFileSync(join(bin, "flow-hosts.json"), "utf8"))
    manifest.hosts.coding.sha256 = digest("smithers-coding-host")
    writeFileSync(join(bin, "flow-hosts.json"), JSON.stringify(manifest))
    for (const name of ["smithers-coding-host", "smithers-model-host"]) {
      writeFileSync(join(bin, name + ".sha256"), digest(name) + "  " + name + "\n")
    }
    return {
      stop,
      environment: async () => {
        const port = await new Promise<number>((resolvePort, reject) => {
          const listener = createServer().once("error", reject)
          listener.listen(0, "127.0.0.1", () => {
            const address = listener.address()
            if (!address || typeof address === "string") throw new Error("No loopback address")
            listener.close((error) => error ? reject(error) : resolvePort(address.port))
          })
        })
        return {
          SMITHERS_BACKEND_BINARY: join(bin, "smithers-backend"),
          SMITHERS_POSTGRES_BUNDLE_DIR: join(root, "postgres"),
          SMITHERS_FLOW_HOST_MANIFEST: join(bin, "flow-hosts.json"),
          SMITHERS_OWNED_BACKEND_ORIGIN: `http://127.0.0.1:${port}`
        }
      }
    }
  } catch (error) {
    try {
      await stop()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Fixture startup and cleanup failed")
    }
    throw error
  }
}
