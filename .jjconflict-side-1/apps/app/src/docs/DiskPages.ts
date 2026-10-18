/*
 * The page and screenshot files read from disk, keyed exactly as bundled.ts's
 * import.meta.glob keys them (`./pages/<slug>.md`, `./images/<file>.webp`).
 * Bun's test runner has no import.meta.glob, so the suites build the docs from
 * this; the browser build never imports it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const PAGES = fileURLToPath(new URL("./pages/", import.meta.url))
const IMAGES = fileURLToPath(new URL("./images/", import.meta.url))

export const diskPageFiles = (): Readonly<Record<string, string>> =>
  Object.fromEntries(
    readdirSync(PAGES)
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => [`./pages/${file}`, readFileSync(`${PAGES}${file}`, "utf8")])
  )

/** Each screenshot file's absolute path, where the build has its asset URL; none while images/ does not exist. */
export const diskImageFiles = (): Readonly<Record<string, string>> =>
  existsSync(IMAGES)
    ? Object.fromEntries(
        readdirSync(IMAGES)
          .filter((file) => file.endsWith(".webp"))
          .sort()
          .map((file) => [`./images/${file}`, `${IMAGES}${file}`])
      )
    : {}
