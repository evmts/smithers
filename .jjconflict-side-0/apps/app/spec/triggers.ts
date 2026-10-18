import { resolve } from "node:path"
import { readFile } from "node:fs/promises"

export const registrations = (config: string) => [
  { id: "spec-sync", flow: "spec/cycle", cron: "*/10 * * * *", input: { kind: "sync", config: resolve(config) } },
  { id: "spec-live", flow: "spec/cycle", cron: "*/30 * * * *", input: { kind: "live", config: resolve(config) } }
]
/** Uses the real local operator CLI; never contacts the mini from a test machine. */
export const triggers = async (command: string, config: string, root: string, run = async (args: string[]) => {
  const child = Bun.spawn(["smthrs", "triggers", ...args, "--root", resolve(root)], { stdin: "ignore", stdout: "inherit", stderr: "inherit" })
  if (await child.exited !== 0) throw new Error("Trigger command failed")
}) => {
  if (!["register", "list", "remove", "main-landed", "after-deploy"].includes(command)) throw new Error("triggers.ts register|list|remove|main-landed|after-deploy <config.json> <root>")
  if (command === "list") { await run(["list"]); return }
  if (command === "register") {
    // Refuse missing/invalid config before any registration is changed.
    JSON.parse(await readFile(config, "utf8"))
    for (const registration of registrations(config)) await run(["register", registration.id, "--flow", registration.flow, "--cron", registration.cron, "--timezone", "UTC", "--overlap", "skip", "--catch-up", "none", "--max-catch-up", "0", "--input", JSON.stringify(registration.input)])
  } else if (command === "remove") {
    // Operator API retains durable history; disabling is its supported removal.
    for (const registration of registrations(config)) await run(["disable", registration.id])
  } else await run(["fire", command === "main-landed" ? "spec-sync" : "spec-live"])
}
if (import.meta.main) {
  const [command, config, root = process.cwd()] = process.argv.slice(2)
  if (!command || !config) throw new Error("triggers.ts register|list|remove|main-landed|after-deploy <config.json> [root]")
  await triggers(command, config, root)
}
