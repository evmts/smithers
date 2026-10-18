#!/usr/bin/env node
// Serve a recorded model as a local OpenAI-compatible endpoint. See
// @smthrs/testing/ModelServerCli for the flags.
import { run } from "@smthrs/testing/ModelServerCli"

const stopped = new Promise((resolve) => {
  process.once("SIGINT", resolve)
  process.once("SIGTERM", resolve)
})
try {
  await run(process.argv.slice(2), process.env, { print: (line) => console.log(line), stopped })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
