#!/usr/bin/env node
/**
 * Runs one package's ImportRules: the program the `ImportRules` macro's target
 * runs, in the declaring package's directory.
 *
 *   node packages/repo-targets/scripts/import-rules.mjs <package directory> '<rules JSON>'
 *
 * The first argument is the package's workspace-relative directory, which the
 * report prefixes to every file; the sources are read from the working
 * directory. It exits 1 on a violation and 2 on a usage or rule error.
 */
import { run } from "../src/ImportRulesCheck.ts"

const [packageDirectory, rules] = process.argv.slice(2)
if (packageDirectory === undefined || rules === undefined) {
  console.error("usage: import-rules.mjs <package directory> '<rules JSON>'")
  process.exit(2)
}
try {
  const outcome = run({ packageDirectory, directory: process.cwd(), rules: JSON.parse(rules) })
  ;(outcome.exitCode === 0 ? console.log : console.error)(outcome.output)
  process.exitCode = outcome.exitCode
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
