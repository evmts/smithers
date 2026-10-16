import { expect, test } from "bun:test"

/** The child's own last lines, bounded: a broken fixture says why it exited, never a transcript. */
const tail = (stream: Uint8Array): string => {
  const text = new TextDecoder().decode(stream).trimEnd()
  const lines = text === "" ? [] : text.split("\n")
  const kept = lines.slice(-10).join("\n")
  return `${lines.length > 10 ? `… ${lines.length - 10} earlier lines\n` : ""}${kept.length > 1000 ? `…${kept.slice(-1000)}` : kept}`
}

/** Run in its own process so module mocks cannot leak into unrelated app tests. */
test("a failed recorded store stops boot before repository, identity, or URL-triggered work", () => {
  const run = Bun.spawnSync({
    cmd: [process.execPath, `${import.meta.dir}/ControllerBoot.recovery.fixture.ts`],
    cwd: `${import.meta.dir}/../..`,
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe"
  })
  // Without the child's own output a module-graph failure in the fixture — a
  // missing export, a throwing double — is indistinguishable from boot having
  // started the work this test forbids. Both assertions need it, and neither
  // needs more than the end of it.
  const why = `fixture exited ${run.exitCode}${run.signalCode ? ` on ${run.signalCode}` : ""}\nstdout:\n${tail(run.stdout)}\nstderr:\n${tail(run.stderr)}`
  expect(run.exitCode, why).toBe(0)
  expect(new TextDecoder().decode(run.stdout), why).toContain("recovery boot stopped before repository")
})
