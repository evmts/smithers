import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Reads source provenance in Git checkouts and jj clones, including those without
 * a .git working tree. In jj, the latest parent is the base revision and @ holds
 * pending edits. Selecting one parent also gives merge working copies a single
 * recorded revision; dirtiness compares their sources to that same parent.
 * Anchor commands at the source repository, independent of the launch directory.
 */
export const sourceIdentity = (
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
  paths: ReadonlyArray<string>
): { readonly commit: string; readonly dirty: boolean } => {
  const jj = existsSync(join(cwd, ".jj"))
  const base = "latest(@-, 1)"
  const read = (args: ReadonlyArray<string>): string =>
    execFileSync(jj ? "jj" : "git", args, { cwd, encoding: "utf8" }).trim()
  const given = env["GITHUB_SHA"]?.trim()
  return {
    commit: given !== undefined && given !== "" ? given : read(
      jj ? ["log", "--no-graph", "-r", base, "-T", "commit_id"] : ["rev-parse", "HEAD"]
    ),
    dirty: read(
      jj
        ? ["diff", "--from", base, "--to", "@", "--name-only", "--", ...paths.map((path) => relative(cwd, path))]
        : ["--no-optional-locks", "status", "--porcelain", "--", ...paths]
    ) !== ""
  }
}
