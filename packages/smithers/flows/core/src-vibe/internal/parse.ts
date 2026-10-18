// VibeLang catch skips defects; YAML conversion must catch ordinary synchronous exceptions.
import * as Result from "effect/Result"
import { isMap, parseDocument } from "yaml"

const summarizeIssue = (issue: {
  readonly message: string
  readonly linePos?: ReadonlyArray<{ readonly line: number; readonly col: number }> | undefined
}): string => {
  // `split` always yields at least one element, so both cuts are total: the
  // first drops the parser's own position suffix, the second drops the source
  // snippet it appends after a newline. Neither the offending line nor the
  // token it contains may reach a caller's log.
  const summary = issue.message.split(" at line ")[0]!.split(/\r?\n/, 1)[0]!.slice(0, 120)
  const position = issue.linePos?.[0]
  /* v8 ignore next -- every yaml parser issue carries a position; the fallback keeps the summary total if one ever does not */
  return position === undefined ? summary : `${summary} at line ${position.line}, column ${position.col}`
}

// Keys that re-point a prototype when a consumer copies the record with
// `Object.assign`, spread into a plain object, or a `for...in` assignment.
// YAML stores them as own properties at every depth, so a third-party SKILL.md
// could smuggle one into `extra` or a nested mapping.
const reservedKeys: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"])

// Walks the converted value depth first. `ancestors` holds the objects on the
// current path, so an alias that re-enters its own anchor (`b: &a { c: *a }`)
// is reported as a cycle instead of recursing without bound; an alias reused
// in two sibling places is not a cycle and is walked normally.
const findRefusal = (value: unknown, ancestors: Set<object> = new Set()): string | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined
  }
  if (ancestors.has(value)) {
    return "Skill frontmatter must not contain a recursive alias"
  }
  ancestors.add(value)
  for (const [key, entry] of Object.entries(value)) {
    if (reservedKeys.has(key)) {
      return `Skill frontmatter must not use the reserved key ${key}`
    }
    const nested = findRefusal(entry, ancestors)
    if (nested !== undefined) {
      return nested
    }
  }
  ancestors.delete(value)
  return undefined
}

export const parseImpl = (frontmatter: string): Result.Result<Record<string, unknown>, string> => {
  let value: unknown
  try {
    const document = parseDocument(frontmatter, {
      schema: "failsafe",
      uniqueKeys: true
    })

    if (document.errors.length > 0) {
      return Result.fail(document.errors.slice(0, 3).map(summarizeIssue).join("; "))
    }
    if (!isMap(document.contents)) {
      return Result.fail("Skill frontmatter must be a YAML mapping")
    }

    value = document.toJS()
  } catch {
    // Conversion can reject aliases. Keep the expansion guard enabled and
    // discard exception messages, which may contain source text.
    return Result.fail("Skill frontmatter could not be parsed or converted from YAML")
  }
  /* v8 ignore next 3 -- a yaml mapping always converts to a non-null object; the guard is defensive against a parser change */
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Result.fail("Skill frontmatter must be a YAML mapping")
  }
  const refusal = findRefusal(value)
  if (refusal !== undefined) {
    return Result.fail(refusal)
  }
  const result = Object.create(null) as Record<string, unknown>
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      writable: false,
      configurable: false
    })
  }
  return Result.succeed(Object.freeze(result))
}
