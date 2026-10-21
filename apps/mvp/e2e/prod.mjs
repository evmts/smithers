#!/usr/bin/env node
// The e2e suite against production (docs/infrastructure.md#against-a-deployment):
//
//   E2E_PROD_URL=<the production deployment's URL> pnpm e2e:prod [spec…] [playwright options…]
//
// It runs Playwright with E2E_TARGET=deployment (e2e/target.ts): the setup signs the test account in or reuses its
// session, every spec runs or skips by its declared needs, and the summary (e2e/summary.ts) prints each spec's results
// and fails the run on a failure, an undeclared skip or a blocked need. Then it makes the run's videos and GIFs, apart
// from a local run's, and exits with Playwright's status, or the recordings' when only they failed.
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

const url = process.env.E2E_PROD_URL ?? ""
if (!/^https:\/\//.test(url)) {
  console.error("Set E2E_PROD_URL to the production deployment's https URL; its deployment details live outside this repository.")
  process.exit(2)
}
const env = { ...process.env, E2E_TARGET: "deployment", BASE_URL: url }
const tests = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", env })
const media = join(homedir(), "Desktop/smithers-mvp/prod")
const recordings = spawnSync("node", ["e2e/gifs.mjs", "test-results-deployment", join(media, "gifs"), join(media, "videos")], { stdio: "inherit", env })
process.exit(tests.status !== 0 ? (tests.status ?? 1) : (recordings.status ?? 1))
