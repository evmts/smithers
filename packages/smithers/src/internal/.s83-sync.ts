import * as WorkspaceObservation from "@smthrs/agent/WorkspaceObservation"
import { Effect } from "effect"
import { readdirSync, lstatSync } from "node:fs"
import { host } from "./NodeWorkspaceObservation.ts"
const root = process.argv[2]!
const prune = new Set(WorkspaceObservation.defaultPrune)
const suf = WorkspaceObservation.defaultIgnoreSuffixes
const syncWalk = () => {
  let n = 0
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (prune.has(e.name) || suf.some((s) => e.name.endsWith(s))) continue
      if (n >= 50000) return
      if (e.isDirectory()) walk(`${d}/${e.name}`)
      else if (e.isFile()) { lstatSync(`${d}/${e.name}`, { bigint: true }); n++ }
    }
  }
  walk(root); return n
}
for (let i = 0; i < 3; i++) {
  let s = performance.now(); const n = syncWalk(); const a = performance.now() - s
  s = performance.now(); const o = await Effect.runPromise(WorkspaceObservation.observeHost(host, root)); const b = performance.now() - s
  console.log("sync", n, a.toFixed(0), "async", o.paths, b.toFixed(0))
}
