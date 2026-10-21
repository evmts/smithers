#!/usr/bin/env node
// Serve a recorded model as a local OpenAI-compatible endpoint. See
// @smthrs/testing/ModelServerCli for the flags.

// In a checkout the package's exports name its source, and that source's
// workspace dependencies may be VibeLang, which Node loads through
// vibelang/register. A published install runs the built JavaScript.
const entry = import.meta.resolve("@smthrs/testing/ModelServerCli")
if (/\.(?:[cm]?ts|vibe)$/.test(new URL(entry).pathname)) await import("vibelang/register")
const { run } = await import(entry)

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
