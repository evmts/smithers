import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"

// Preserve explicit report destinations; reclaim only this process's default scratch report.
export function setup(project) {
  const directory = resolve(project.vitest.config.coverage.reportsDirectory)
  const owned = dirname(directory) === resolve(tmpdir()) && basename(directory).endsWith(`-coverage-${process.pid}`)
  return async () => {
    if (owned) await rm(directory, { recursive: true, force: true })
  }
}
