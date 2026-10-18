import { realpath } from "node:fs/promises"
import { startNativeBackend } from "./NativeBackendProcess"
import { nativeStateDirectory } from "./NativeState"
import { connectLocalGateway } from "./LocalWorkflowGateway"
import { basename, resolve, relative, isAbsolute, sep } from "node:path"

const stateDir = nativeStateDirectory()
const argument = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const publicOrigins = process.argv.flatMap((value, at) => value === "--origin" && process.argv[at + 1] ? [process.argv[at + 1]!] : [])
const gatewayUrl = argument("--gateway")
if (process.argv.includes("--gateway") && !gatewayUrl) throw new Error("--gateway requires a loopback URL.")
const startGateway = async () => {
  const { startLocalServer, defaultDistDir } = await import("./server")
  const tokenFile = argument("--gateway-token-file")
  if (!tokenFile) throw new Error("--gateway requires --gateway-token-file.")
  const distDir = await realpath(argument("--dist") ?? defaultDistDir(import.meta.dir))
  const tokenPath = await realpath(tokenFile)
  const within = relative(distDir, tokenPath)
  if (within === "" || (within !== ".." && !within.startsWith(".." + sep) && !isAbsolute(within))) {
    throw new Error("--gateway-token-file must be outside --dist.")
  }
  const root = resolve(argument("--root") ?? process.cwd())
  // A local namespace is a binding, never an invented GitHub repository row.
  const repo = argument("--repo") ?? `local/${basename(root)}`
  const localGateway = await connectLocalGateway({ url: gatewayUrl!, tokenFile, root, repo })
  if (publicOrigins.length > 1) throw new Error("Local gateway mode accepts one --origin.")
  const origin = new URL(publicOrigins[0] ?? "http://127.0.0.1:0")
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Local gateway mode requires a localhost HTTP app origin.")
  }
  return startLocalServer({
    localGateway, cloudMode: "offline",
    distDir, privateFiles: [tokenPath],
    port: Number(origin.port || 80), publicHostname: origin.hostname as "localhost" | "127.0.0.1",
    log: (line) => { if (!line.startsWith("SMITHERS_LOCAL_ORIGIN=")) console.log(line) }
  })
}
const backend = gatewayUrl === undefined ? await startNativeBackend({
  stateDir,
  ...(argument("--bind") === undefined ? {} : { bind: argument("--bind")! }),
  publicOrigins,
  ...(process.argv.includes("--setup-handoff=socket") ? { setupHandoff: "socket" as const } : {})
}) : await startGateway()
const origin = backend.origin

await new Promise<void>((resolveShutdown) => {
  let stopping = false
  const stop = (failure?: Error): void => {
    if (stopping) return
    stopping = true
    if (failure !== undefined) {
      console.error(failure.message)
      process.exitCode = 1
    }
    void backend.stop().then(resolveShutdown, (error) => {
      console.error(error)
      process.exitCode = 1
      resolveShutdown()
    })
  }
  process.on("SIGINT", () => stop())
  process.on("SIGTERM", () => stop())
  void ("failure" in backend ? backend.failure : undefined)?.then((failure) => {
    if (failure !== undefined) stop(failure)
  })
  console.log(`SMITHERS_LOCAL_ORIGIN=${origin}`)
})
