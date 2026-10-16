/**
 * Targets for the offline burndown pacer.
 *
 * The pacer is an operations script, not an example of any package: it reads a
 * quota and machine snapshot and recommends a concurrency, and `burndown.sh`
 * ticks a batch command at that pace. It imports nothing from Smithers.
 */
import { Smithers } from "@smthrs/targets"

/**
 * Runs the pacer's `node:test` suite under Node's own runner, the command
 * PACER.md documents. The suite spawns `pacer.mjs` and the `burndown.sh` tick
 * loop, so the whole directory is its input.
 *
 * @since 1.0.0
 * @category test
 */
const pacer = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("//scripts/burndown/pacer.test.mjs")]),
  srcs: [Smithers.glob("//scripts/burndown/**")],
  deps: []
})

export const Package = Smithers.Package({ targets: { pacer } })
