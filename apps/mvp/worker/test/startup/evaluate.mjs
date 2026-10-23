// Loads the Worker bundle at argv[2] as workerd does at startup, in this fresh Node process, and prints how long its
// module evaluation took: `cloudflare:*` resolves to ./cloudflare-workers.mjs, everything else as Node resolves it.
import { registerHooks } from "node:module"
const stub = new URL("./cloudflare-workers.mjs", import.meta.url).href
registerHooks({
  resolve: (specifier, context, next) =>
    specifier.startsWith("cloudflare:") ? { url: stub, shortCircuit: true } : next(specifier, context),
})
const started = performance.now()
const cpuStarted = process.cpuUsage()
await import(process.argv[2])
const evaluationMs = performance.now() - started
const cpu = process.cpuUsage(cpuStarted)
console.log(JSON.stringify({ evaluationMs, cpuMs: (cpu.user + cpu.system) / 1000 }))
