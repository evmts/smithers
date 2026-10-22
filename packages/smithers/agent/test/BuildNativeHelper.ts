import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** Builds the real no-follow filesystem host used by FlowStore's disk tests. */
export default function buildNativeHelper(): void {
  const checkout = fileURLToPath(new URL("../../../../", import.meta.url))
  const release = existsSync(join(checkout, "target/release/smithers-jj-export"))
  const build = spawnSync(
    "cargo",
    [
      "build",
      "--locked",
      "--target-dir",
      join(checkout, "target"),
      ...(release ? ["--release"] : []),
      "-p",
      "smithers-ffi",
      "--bin",
      "smithers-jj-export"
    ],
    {
      cwd: checkout,
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 15 * 60_000
    }
  )
  if (build.error !== undefined || build.status !== 0) {
    throw new Error("Building the FlowStore native filesystem helper failed", { cause: build.error })
  }
}
