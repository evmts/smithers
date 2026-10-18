// VibeLang lifts plain synchronous throws into Effect failures, changing factory APIs.
import { isAbsolute } from "node:path"

/** The longest message a factory refuses with, in UTF-16 code units. */
const messageLimit = 255

/** How many code points of a refused root the message repeats at most. */
const previewLimit = 64

/**
 * A bounded, quoted excerpt of a refused root that fits in `budget` code
 * units of the message.
 *
 * Counted in code points rather than UTF-16 units so a cut never splits a
 * surrogate pair, and passed through `JSON.stringify` so a newline in the root
 * cannot break the log line the message lands on. Each code point is encoded
 * on its own and admitted only while the quoted excerpt plus the length
 * suffix still fit, so a control character that widens to a `\u0001` escape
 * shortens the excerpt instead of lengthening the message, and a cut never
 * lands inside an escape.
 */
const preview = (root: string, budget: number): string => {
  const points = Array.from(root)
  const whole = JSON.stringify(root)
  if (points.length <= previewLimit && whole.length <= budget) return whole
  const suffix = `... (${points.length} characters)`
  const room = budget - suffix.length - 2
  let excerpt = ""
  for (const point of points.slice(0, previewLimit)) {
    const encoded = JSON.stringify(point).slice(1, -1)
    if (excerpt.length + encoded.length > room) break
    excerpt += encoded
  }
  return `"${excerpt}"${suffix}`
}

/**
 * Refuses a root the `Jj` adapter underneath would refuse, here and in this
 * package's name.
 *
 * `BunJj.layerAt` and `BunJj.layerSpawnerAt` are `NodeJj`'s, and those throw a
 * bare `TypeError` that names `NodeJj`, carries no code, and echoes the whole
 * string. The predicate includes the same `isAbsolute` the adapter applies, so
 * a root that passes this check cannot reach that throw. An absolute root
 * containing NUL is refused too: no filesystem or process API can represent it.
 */
export const absoluteRoot = (ErrorType: new (fields: { code: "invalid_repository_root"; message: string }) => Error, factory: "layerAt" | "layerContainedAt", root: string): string => {
  // An absolute root with NUL names that defect, not absoluteness it already has.
  const requirement = !isAbsolute(root)
    ? "an absolute repository root"
    : root.includes("\0")
    ? "a repository root without NUL"
    : undefined
  if (requirement === undefined) return root
  const prefix = `BunHost.${factory} requires ${requirement}, got `
  throw new ErrorType({
    code: "invalid_repository_root",
    message: `${prefix}${preview(root, messageLimit - prefix.length)}`
  })
}

