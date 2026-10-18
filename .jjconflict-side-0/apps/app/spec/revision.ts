import { execFileSync } from "node:child_process"

/** Let jj reconcile concurrent operation heads without snapshotting the shared checkout. */
export const revision = (cwd = process.cwd()): string =>
  execFileSync("jj", ["--ignore-working-copy", "log", "-r", "@", "--no-graph", "-T", "commit_id"], { cwd, encoding: "utf8" }).trim()
