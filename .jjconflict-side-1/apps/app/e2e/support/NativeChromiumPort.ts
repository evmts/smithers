import type { ChildProcess } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Chromium creates DevToolsActivePort before writing it. An empty read is not
// readiness, and a dead child cannot become ready on a later poll.
export const waitForNativeChromiumPort = async (child: ChildProcess, profile: string): Promise<string> => {
  let stderr = "", spawnError: Error | undefined
  const record = (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-16_384) }
  const failed = (error: Error) => { spawnError = error }
  child.stderr?.on("data", record)
  child.on("error", failed)
  const failure = () => new Error(`Notification test browser did not start (exit=${child.exitCode}, signal=${child.signalCode}): ${spawnError?.message ?? stderr}`)
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw failure()
      try {
        const [port, endpoint] = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")
        if (endpoint?.startsWith("/devtools/browser/") && port && /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535) return port
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw failure()
  } finally {
    child.removeListener("error", failed)
    child.stderr?.removeListener("data", record)
    child.stderr?.resume()
  }
}
