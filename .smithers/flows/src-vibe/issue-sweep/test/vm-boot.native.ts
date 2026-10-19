// A-2/E-4 (D38) and E-7: vm-boot is a command-line script that drives the
// Microsandbox SDK's promises directly. Its runner (Effect.runPromise),
// process.argv, process.pid, the clock, the SDK calls and stdout stay
// TypeScript, verbatim from issue-sweep/test/vm-boot.ts; vm-boot.vibe hands it
// the SDK and the snapshot lookup.
import type { MicrosandboxSandbox } from "@smthrs/sandbox"
import { Effect } from "effect"

export const run = async <E>(
  sdk: MicrosandboxSandbox.Sdk,
  latestImage: (sdk: MicrosandboxSandbox.Sdk) => Effect.Effect<string, E>
): Promise<void> => {
  const n = Number(process.argv[2] ?? 8)
  const snapshot = await Effect.runPromise(latestImage(sdk))
  const t0 = Date.now()
  const at = () => Number(((Date.now() - t0) / 1000).toFixed(2))
  const rows = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const start = at()
    const box = await sdk.Sandbox.builder(`boot-probe-${process.pid}-${i}`).fromSnapshot(snapshot).cpus(2).memory(3072)
      .disableNetwork().ephemeral(true).detached(false).create()
    const created = at()
    await box.fs().mkdir("/tmp/probe")
    const ready = at()
    return { box, start, created, ready }
  }))
  process.stdout.write(`${JSON.stringify(rows.map(({ start, created, ready }) => [start, created, ready]))}\n`)
  await Promise.all(rows.map(({ box }) => box.destroy({ timeoutMs: 3000, force: true })))
  process.stdout.write(`${JSON.stringify({ n, removed: at() })}\n`)
}
