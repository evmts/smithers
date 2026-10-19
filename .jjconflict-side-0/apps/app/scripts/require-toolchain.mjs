/**
 * The unit suite's preload: refuses a Bun or Node below the root `engines`
 * floors before any test runs, so an old toolchain reads as one line instead
 * of test failures, and makes the JUnit report directory this package's
 * `bunfig.toml` declares (scripts/junit-report-dir.ts says why).
 */
import { requireToolchain } from "../../../packages/repo-targets/contracts/require-toolchain.mjs"
import { ensureJunitReportDir } from "./junit-report-dir.ts"

requireToolchain()
ensureJunitReportDir()
