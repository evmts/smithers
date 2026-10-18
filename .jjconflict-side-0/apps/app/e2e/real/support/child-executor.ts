import { spawnSync as nativeSpawnSync } from "node:child_process"

/**
 * The synchronous child executor this runtime can actually wait on, resolved once.
 *
 * Under Bun, `node:child_process`'s synchronous spawn can miss the exit of a
 * child that already finished: on GitHub's runners `git show` answered in
 * milliseconds and the call still raised `spawnSync git ETIMEDOUT` after the
 * whole budget (#3763; AppsDeploy 38957448693, unit shard). `scripts/test-child`
 * is the repair for that family: a Node supervisor waits for the exit, publishes
 * the answer by rename, and kills the child's own process group at the budget.
 *
 * Node keeps the native synchronous pipe. It never had the fault, and the
 * boundary is an ES module whose `import.meta` is a syntax error in the
 * CommonJS Playwright transpiles this tier's specs to: a static import takes
 * the importing spec out of the suite entirely. `require` is lazy, so a
 * Playwright run never loads it.
 */
let executor: typeof nativeSpawnSync | undefined
export const spawnSync = ((...args: Parameters<typeof nativeSpawnSync>) => (executor ??= typeof Bun === "undefined"
  ? nativeSpawnSync
  : (require("../../../scripts/test-child") as { readonly spawnSync: typeof nativeSpawnSync }).spawnSync)(...args)) as typeof nativeSpawnSync
