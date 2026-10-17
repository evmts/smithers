/*
 * The one safe spelling of a zod issue's path for a diagnostic.
 *
 * A zod issue's path names the schema's own keys — EXCEPT inside a `z.record`,
 * where the segment is a key the DATA chose: a transcript anchor id, a handoff
 * manifest key, or the key of a card action's `args`, which a model host picks
 * and a customer's own text can reach. Those are values, not field names, and
 * a diagnostic that prints one hands the crash sink arbitrary host text under
 * the cover of a field list. So a segment is only spelled out when the schema
 * the decode used declares it somewhere; every other segment becomes `*`.
 * Array positions are the schema's own counting, not data, so they stay.
 *
 * What a reader keeps is a finite vocabulary: the schema's declared key names,
 * row and element indices, and `*` for a dynamic key, which still says WHERE
 * in the shape the rejection sat. A data key that happens to spell one of the
 * schema's own names is printed, and that is the bound of what this discloses:
 * one word of a vocabulary the schema already publishes.
 */

import type { z } from "zod"

/*
 * Walking a schema costs the whole tree, and a refusal can arrive once per
 * rejected row, so each schema's declared names are computed once. The key is
 * the schema object itself, so a schema that stops being referenced is
 * collected with its name set.
 */
const declaredKeys = new WeakMap<z.ZodType, ReadonlySet<string>>()

/** Every object key the schema declares anywhere beneath it, including through lazy recursion points. */
export const schemaKeyNames = (schema: z.ZodType): ReadonlySet<string> => {
  const cached = declaredKeys.get(schema)
  if (cached !== undefined) return cached
  const names = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): void => {
    if (typeof node !== "object" || node === null || depth > 64 || seen.has(node)) return
    seen.add(node)
    const def = (node as { readonly _zod?: { readonly def?: unknown } })._zod?.def
    if (typeof def !== "object" || def === null) return
    const fields = def as Record<string, unknown>
    if (typeof fields.shape === "object" && fields.shape !== null) {
      for (const [name, child] of Object.entries(fields.shape)) { names.add(name); walk(child, depth + 1) }
    }
    for (const key of ["innerType", "element", "valueType", "keyType", "left", "right", "in", "out"]) walk(fields[key], depth + 1)
    if (Array.isArray(fields.options)) for (const option of fields.options) walk(option, depth + 1)
    // A lazy schema is the recursion point; `seen` holds its own node, so this terminates.
    if (typeof fields.getter === "function") walk((fields.getter as () => unknown)(), depth + 1)
  }
  walk(schema, 0)
  declaredKeys.set(schema, names)
  return names
}

/**
 * One rejected position, written with the schema's own words only: a declared
 * key is spelled, an index is kept, and a key the data chose becomes `*`.
 */
export const declaredIssuePath = (schema: z.ZodType, path: ReadonlyArray<PropertyKey>): string => {
  const names = schemaKeyNames(schema)
  return path.map(part => typeof part === "number" ? String(part) : names.has(String(part)) ? String(part) : "*").join(".")
}
