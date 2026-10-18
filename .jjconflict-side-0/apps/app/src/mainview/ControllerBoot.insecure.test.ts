import { expect, test } from "bun:test"
import { runSync } from "../../scripts/test-child"

/*
 * mvp.md §6.1 and spec §16.3.2: the app boots on a plain-HTTP LAN origin. Before T-INS-04 the first
 * crypto.randomUUID() call (AppStore) threw and the page stayed blank. Its own process: the fixture replaces `crypto`.
 */
test("the app boots to Setup without crypto.randomUUID, crypto.subtle or Web Locks", () => {
  const run = runSync([process.execPath, `${import.meta.dir}/ControllerBoot.insecure.fixture.ts`], { cwd: `${import.meta.dir}/../..`, timeout: 60_000 })
  const output = new TextDecoder().decode(run.stdout) + new TextDecoder().decode(run.stderr)
  expect(output).toContain("insecure boot reached Setup: repository,models,source,machine")
  expect(run.exitCode).toBe(0)
}, 65_000)
