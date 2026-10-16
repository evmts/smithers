import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

/** The installed Effect release, which the exporters report as their scope and SDK version. */
export const effectVersion = (JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve("effect/package.json"), "utf8")
) as { readonly version: string }).version
