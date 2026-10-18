/**
 * The schema identity projection: the JSON-Schema-shaped document a schema
 * contributes to a step key.
 *
 * A call node folds what its callee accepts and produces into the material a
 * step key is derived from, and a catch node folds its filter the same way. A
 * projection that printed differently under another `effect` release would
 * re-key every recorded step in every journal at once. `effect` is a peer
 * range, so the application picks the release; the projection therefore
 * cannot be the installed `Schema.toJsonSchemaDocument`. `effect@4.0.4`
 * already changed what that emitter prints for `Schema.Int`, `isMinLength`,
 * `isPattern`, repeated bounds, `oneOf` unions and shared definitions.
 *
 * This module owns the bytes instead. It reads the schema through two public
 * functions, `Schema.toCodecJson` and `Schema.toRepresentation`, and prints
 * the result with the emitter and the check fragments fixed below, which
 * reproduce `Schema.toJsonSchemaDocument(schema, options)` of
 * `effect@4.0.0-rc.115` for both values of `onExcessProperty`.
 *
 * It is for identity only. Where a JSON Schema is shown to a model or a
 * person, the installed emitter is the right one.
 *
 * What still moves an identity, by design: a release that changes a schema's
 * JSON codec or its representation changes what the schema accepts on the
 * wire. Three limits follow from what the representation carries:
 *
 * - A built-in check contributes the constraint its id and payload name. A
 *   `toJsonSchema` annotation passed to a built-in check constructor is not
 *   consulted; one on a `makeFilter` check is.
 * - A built-in check this module does not list falls back to the installed
 *   check's own `toJsonSchema` annotation.
 * - `Schema.brand` is not part of the representation from `effect@4.0.4` on.
 *   Under rc.115 a schema that takes a definition (an `identifier` or a
 *   recursive schema) and appeared both branded and unbranded in one document
 *   got two definitions; it now gets one.
 *
 * Provenance: {@link fromRepresentation} and its helpers are adapted from
 * `effect@4.0.0-rc.115` (MIT, Copyright (c) 2023 Effectful Technologies Inc;
 * the notice is in this package's `THIRD_PARTY_NOTICES.md`), files
 * `src/internal/schema/toJsonSchemaDocument.ts`, `src/JsonSchema.ts`
 * (`rewriteRefs`), `src/JsonPointer.ts` and `src/SchemaAST.ts` (`isJson`).
 * Changes: `onExcessProperty` is the only option; one root; a built-in
 * check's fragment comes from {@link builtinChecks}, not from
 * the installed annotation; an approximate check result contributes its
 * schema.
 *
 * @since 1.0.0
 */

import type * as JsonSchema from "effect/JsonSchema"
import * as Schema from "effect/Schema"
import type * as SchemaAST from "effect/SchemaAST"
import * as SchemaRepresentation from "effect/SchemaRepresentation"

/** @private */
type Fragment = JsonSchema.JsonSchema

/** @private */
type Path = ReadonlyArray<string | number>

/** @private */
type Representation = SchemaRepresentation.Representation

/** @private */
type Check = SchemaRepresentation.Check

/** @private */
type CheckInput = SchemaRepresentation.ToJsonSchema.CheckInput

/**
 * The document a schema's identity is: exactly what rc.115 returned from
 * `Schema.toJsonSchemaDocument`, key order included.
 *
 * @since 1.0.0
 * @private
 */
export type Document = JsonSchema.Document<"draft-2020-12">

/**
 * How an object schema treats a key it does not declare, which is the one
 * emitter option a declaration's identity is taken under. It has rc.115's
 * meaning and rc.115's default: `"ignore"` leaves such keys open, `"error"`
 * closes them.
 *
 * @since 1.0.0
 * @private
 */
export interface Options {
  readonly onExcessProperty?: "ignore" | "error" | undefined
}

/**
 * A schema a step key cannot be derived from: one with no JSON Schema form or
 * no representation, or one whose built-in check the installed `effect`
 * describes differently from the releases this package supports. The message
 * is the one `effect@4.0.0-rc.115` gave for the same schema, where it gave one.
 *
 * @since 1.0.0
 * @category errors
 */
export class SchemaIdentityError extends Schema.TaggedError<SchemaIdentityError>()("@smthrs/plan/SchemaIdentityError", {
  message: Schema.String
}) {}

/** @private */
const invalid = (message: string, path: Path): SchemaIdentityError =>
  new SchemaIdentityError({
    message: path.length === 0
      ? message
      : `${message}\n  at ${path.map((key) => `[${typeof key === "string" ? JSON.stringify(key) : key}]`).join("")}`
  })

/** @private */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Assigns an own property, `__proto__` included: a struct may declare a field
 * by that name, and plain assignment would set the prototype instead.
 *
 * @private
 */
const assignProperty = (target: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })
  } else {
    target[key] = value
  }
}

/**
 * Whether a value is JSON: finite numbers, plain objects, no cycles. An
 * annotation that is not JSON never reaches the document.
 *
 * @private
 */
const isJson = (value: unknown, path: ReadonlySet<object> = new Set()): boolean => {
  if (typeof value !== "object" || value === null) {
    return value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
  }
  if (path.has(value)) return false
  const members = Array.isArray(value) ? Array.from<unknown>(value) : plainValues(value)
  if (members === undefined) return false
  const inner = new Set(path).add(value)
  return members.every((member) => isJson(member, inner))
}

/** @private */
const plainValues = (value: object): ReadonlyArray<unknown> | undefined => {
  const prototype: unknown = Object.getPrototypeOf(value)
  // A plain object from another realm has a different `Object.prototype`,
  // but that prototype still has a null prototype.
  return prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null
    ? Object.values(value)
    : undefined
}

/**
 * Structural equality of two emitted schemas, ignoring key order. `NaN`
 * equals itself: an author's fragment may carry one, and two definitions that
 * differ in nothing else are one definition.
 *
 * @private
 */
const sameJson = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((member, index) => sameJson(member, right[index]))
  }
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
  }
  return left === right || (left !== left && right !== right)
}

/** @private */
const escapeRegExp = (text: string): string => text.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")

/** @private */
const unescapeToken = (token: string): string => token.replace(/~1/g, "/").replace(/~0/g, "~")

/** @private */
const definitionReference = (key: string): string =>
  `#/$defs/${encodeURI(key.replace(/~/g, "~0").replace(/\//g, "~1")).replace(/#/g, "%23")}`

/**
 * The JSON Pointer a URI fragment names, or `undefined` when it names none.
 *
 * @private
 */
const decodeUriFragment = (fragment: string): string | undefined => {
  if (fragment.length === 0 || fragment === "#") return ""
  if (!fragment.startsWith("#")) return undefined
  const encoded = fragment.slice(1)
  try {
    if (encodeURI(encoded).replace(/%25/g, "%").replace(/#/g, "%23") !== encoded) return undefined
    const pointer = decodeURIComponent(encoded)
    return pointer.startsWith("/") && !/~(?:[^01]|$)/.test(pointer) ? pointer : undefined
  } catch {
    return undefined
  }
}

/**
 * Copies a schema, rewriting every `$ref` and `$dynamicRef` in a schema
 * position. Values that are data (`enum`, `const`, `default`, `examples`) are
 * not walked.
 *
 * @private
 */
const rewriteRefs = (node: Fragment, rewrite: (reference: string) => string): Fragment => {
  const walk = (value: unknown): unknown => isObject(value) ? rewriteRefs(value, rewrite) : value
  const out: Fragment = {}
  for (const key of Object.keys(node)) {
    const value = node[key]
    let transformed = value
    switch (key) {
      case "$defs":
      case "properties":
      case "patternProperties":
      case "dependentSchemas":
        if (isObject(value)) {
          const mapped: Fragment = {}
          for (const name of Object.keys(value)) assignProperty(mapped, name, walk(value[name]))
          transformed = mapped
        }
        break
      case "allOf":
      case "anyOf":
      case "oneOf":
      case "prefixItems":
        if (Array.isArray(value)) transformed = value.map(walk)
        break
      case "not":
      case "additionalProperties":
      case "propertyNames":
      case "unevaluatedProperties":
      case "items":
      case "contains":
      case "unevaluatedItems":
      case "if":
      case "then":
      case "else":
      case "contentSchema":
        transformed = walk(value)
    }
    assignProperty(out, key, transformed)
  }
  if (typeof out["$ref"] === "string") out["$ref"] = rewrite(out["$ref"])
  if (typeof out["$dynamicRef"] === "string") out["$dynamicRef"] = rewrite(out["$dynamicRef"])
  return out
}

/**
 * The annotations a JSON Schema states, in the order rc.115 printed them.
 *
 * @private
 */
const ordinaryAnnotations = (annotations: Schema.Annotations.Annotations | undefined): Fragment | undefined => {
  if (annotations === undefined) return undefined
  const out: Fragment = {}
  if (typeof annotations["title"] === "string") out["title"] = annotations["title"]
  if (typeof annotations["description"] === "string") out["description"] = annotations["description"]
  if (isJson(annotations["default"])) out["default"] = annotations["default"]
  if (Array.isArray(annotations["examples"]) && isJson(annotations["examples"])) {
    out["examples"] = annotations["examples"]
  }
  if (typeof annotations["readOnly"] === "boolean") out["readOnly"] = annotations["readOnly"]
  if (typeof annotations["writeOnly"] === "boolean") out["writeOnly"] = annotations["writeOnly"]
  if (typeof annotations["format"] === "string") out["format"] = annotations["format"]
  if (typeof annotations["contentEncoding"] === "string") out["contentEncoding"] = annotations["contentEncoding"]
  if (typeof annotations["contentMediaType"] === "string") out["contentMediaType"] = annotations["contentMediaType"]
  if (isJson(annotations["contentSchema"])) out["contentSchema"] = annotations["contentSchema"]
  return Object.keys(out).length === 0 ? undefined : out
}

/** @private */
const finitePattern = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?"

/** @private */
const stringPattern = "[\\s\\S]*?"

/** @private */
const bigIntPattern = "^-?\\d+$"

/** @private */
const symbolPattern = "^Symbol\\(([\\s\\S]*)\\)$"

/** @private */
const uuidPattern = (version: number | null): string =>
  version === null
    ? "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|" +
      "00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$"
    : `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`

/**
 * One field of a built-in check's payload. A release that renamed or retyped
 * it would otherwise print `undefined` into an identity, so it is refused.
 *
 * @private
 */
const field = <A>(id: string, payload: unknown, name: string, is: (value: unknown) => value is A): A => {
  const value = isObject(payload) ? payload[name] : undefined
  if (!is(value)) {
    throw new SchemaIdentityError({
      message: `Cannot derive a schema identity: check ${id} carries no usable "${name}" in its payload. ` +
        "The installed effect release describes this check differently from the releases @smthrs/plan supports."
    })
  }
  return value
}

/** @private */
const isNumber = (value: unknown): value is number => typeof value === "number"

/** @private */
const isString = (value: unknown): value is string => typeof value === "string"

/** @private */
const isVersion = (value: unknown): value is number | null => value === null || typeof value === "number"

/** @private */
const isFlag = (value: unknown): value is boolean | undefined => value === undefined || typeof value === "boolean"

/**
 * What a built-in check prints: its payload and the JSON type it refines in,
 * a fragment out. `null` is a check that prints nothing.
 *
 * @private
 */
type BuiltinCheck = ((id: string, payload: unknown, input: CheckInput) => Fragment) | null

/** @private */
const pattern = (source: string): BuiltinCheck => () => ({ pattern: source })

/** @private */
const literalPattern = (name: string, source: (escaped: string) => string): BuiltinCheck => (id, payload) => ({
  pattern: new RegExp(source(escapeRegExp(field(id, payload, name, isString)))).source
})

/** @private */
const bound = (keyword: string, name: string = keyword): BuiltinCheck => (id, payload) => ({
  [keyword]: field(id, payload, name, isNumber)
})

/** @private */
const length = (name: string, array: string, string: string): BuiltinCheck => (id, payload, input) => ({
  [input.type === "array" ? array : string]: field(id, payload, name, isNumber)
})

/** @private */
const empty: BuiltinCheck = () => ({})

/**
 * Every built-in check, keyed by the id its representation carries, with the
 * fragment `effect@4.0.0-rc.115` printed for it.
 *
 * The three code-point checks did not exist under rc.115; they print what
 * `effect@4.0.4` introduced them with. The date, big integer and size checks
 * print nothing but still carry their own annotations, which is what the
 * empty fragment keeps.
 *
 * @private
 */
const builtinChecks: ReadonlyMap<string, BuiltinCheck> = new Map<string, BuiltinCheck>([
  ["effect/schema/isTrimmed", pattern("^\\S[\\s\\S]*\\S$|^\\S$|^$")],
  ["effect/schema/isPattern", (id, payload) => ({ pattern: field(id, payload, "source", isString) })],
  ["effect/schema/isStringFinite", pattern(`^${finitePattern}$`)],
  ["effect/schema/isStringBigInt", pattern(bigIntPattern)],
  ["effect/schema/isStringSymbol", pattern(symbolPattern)],
  ["effect/schema/isUUID", (id, payload) => ({
    pattern: uuidPattern(field(id, payload, "version", isVersion)),
    format: "uuid"
  })],
  ["effect/schema/isGUID", pattern("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$")],
  ["effect/schema/isULID", pattern("^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$")],
  ["effect/schema/isBase64", pattern("^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$")],
  ["effect/schema/isBase64Url", pattern("^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$")],
  ["effect/schema/isStartingWith", literalPattern("startsWith", (escaped) => `^${escaped}`)],
  ["effect/schema/isEndingWith", literalPattern("endsWith", (escaped) => `${escaped}$`)],
  ["effect/schema/isIncluding", literalPattern("includes", (escaped) => escaped)],
  ["effect/schema/isUppercased", pattern("^[^a-z]*$")],
  ["effect/schema/isLowercased", pattern("^[^A-Z]*$")],
  ["effect/schema/isCapitalized", pattern("^(?:[^a-z][\\s\\S]*)?$")],
  ["effect/schema/isUncapitalized", pattern("^(?:[^A-Z][\\s\\S]*)?$")],
  ["effect/schema/isFinite", () => ({ type: "number" })],
  ["effect/schema/isInt", () => ({ type: "integer" })],
  ["effect/schema/isGreaterThan", bound("exclusiveMinimum")],
  ["effect/schema/isGreaterThanOrEqualTo", bound("minimum")],
  ["effect/schema/isLessThan", bound("exclusiveMaximum")],
  ["effect/schema/isLessThanOrEqualTo", bound("maximum")],
  ["effect/schema/isBetween", (id, payload) => ({
    [field(id, payload, "exclusiveMinimum", isFlag) ? "exclusiveMinimum" : "minimum"]: field(
      id,
      payload,
      "minimum",
      isNumber
    ),
    [field(id, payload, "exclusiveMaximum", isFlag) ? "exclusiveMaximum" : "maximum"]: field(
      id,
      payload,
      "maximum",
      isNumber
    )
  })],
  ["effect/schema/isMultipleOf", bound("multipleOf", "divisor")],
  ["effect/schema/isGreaterThanDate", empty],
  ["effect/schema/isGreaterThanOrEqualToDate", empty],
  ["effect/schema/isLessThanDate", empty],
  ["effect/schema/isLessThanOrEqualToDate", empty],
  ["effect/schema/isBetweenDate", empty],
  ["effect/schema/isGreaterThanBigInt", empty],
  ["effect/schema/isGreaterThanOrEqualToBigInt", empty],
  ["effect/schema/isLessThanBigInt", empty],
  ["effect/schema/isLessThanOrEqualToBigInt", empty],
  ["effect/schema/isBetweenBigInt", empty],
  ["effect/schema/isMinLength", length("minLength", "minItems", "minLength")],
  ["effect/schema/isMaxLength", length("maxLength", "maxItems", "maxLength")],
  ["effect/schema/isBetweenLength", (id, payload, input) => {
    const minimum = field(id, payload, "minimum", isNumber)
    const maximum = field(id, payload, "maximum", isNumber)
    return input.type === "array"
      ? { allOf: [{ minItems: minimum }, { maxItems: maximum }] }
      : { allOf: [{ minLength: minimum }, { maxLength: maximum }] }
  }],
  ["effect/schema/isMinCodePoints", bound("minLength", "minCodePoints")],
  ["effect/schema/isMaxCodePoints", bound("maxLength", "maxCodePoints")],
  ["effect/schema/isBetweenCodePoints", (id, payload) => ({
    allOf: [
      { minLength: field(id, payload, "minimum", isNumber) },
      { maxLength: field(id, payload, "maximum", isNumber) }
    ]
  })],
  ["effect/schema/isMinSize", empty],
  ["effect/schema/isMaxSize", empty],
  ["effect/schema/isBetweenSize", empty],
  ["effect/schema/isMinProperties", bound("minProperties")],
  ["effect/schema/isMaxProperties", bound("maxProperties")],
  ["effect/schema/isBetweenProperties", (id, payload) => ({
    minProperties: field(id, payload, "minimum", isNumber),
    maxProperties: field(id, payload, "maximum", isNumber)
  })],
  ["effect/schema/isPropertyNames", (_id, _payload, input) => ({ propertyNames: input.schemas[0] })],
  ["effect/schema/isUnique", () => ({ uniqueItems: true })],
  ["effect/schema/isUniqueKey", null]
])

/**
 * The ids {@link builtinChecks} lists, for the test that holds the list
 * against the checks the installed `effect` can revive.
 *
 * @since 1.0.0
 * @private
 */
export const builtinCheckIds: ReadonlyArray<string> = [...builtinChecks.keys()]

/** @private */
const isCheckCallback = (value: unknown): value is SchemaRepresentation.ToJsonSchema.Check =>
  typeof value === "function"

/** @private */
const isApproximate = (
  output: SchemaRepresentation.ToJsonSchema.CheckOutput
): output is readonly [schema: Fragment, approximate: true] => Array.isArray(output)

/**
 * What prints a check, if anything does: the owned fragment for a built-in
 * check, otherwise the author's own `toJsonSchema` annotation.
 *
 * @private
 */
const fragmentSource = (check: Check): ((input: CheckInput) => Fragment) | undefined => {
  const representation = check.representation
  const builtin = representation === undefined ? undefined : builtinChecks.get(representation.id)
  if (representation !== undefined && builtin !== undefined) {
    return builtin === null ? undefined : (input) => builtin(representation.id, representation.payload, input)
  }
  const callback = check.annotations?.["toJsonSchema"]
  if (!isCheckCallback(callback)) return undefined
  return (input) => {
    const output = callback(input)
    return isApproximate(output) ? output[0] : output
  }
}

/** @private */
type NumberType = "number" | "integer"

/** @private */
const extractNumberType = (schema: Fragment): { readonly type: NumberType | undefined; readonly schema: Fragment } => {
  let type: NumberType | undefined = schema["type"] === "number" || schema["type"] === "integer"
    ? schema["type"]
    : undefined
  let out = schema
  if (type !== undefined) {
    out = { ...schema }
    delete out["type"]
  }
  const allOf = out["allOf"]
  if (Array.isArray(allOf)) {
    const members: Array<Fragment> = []
    let changed = false
    for (const member of allOf) {
      const extracted = extractNumberType(member)
      if (extracted.type !== undefined) {
        changed = true
        if (type === undefined || extracted.type === "integer") type = extracted.type
      }
      if (Object.keys(extracted.schema).length > 0) members.push(extracted.schema)
    }
    if (changed) {
      const { allOf: _, ...rest } = out
      out = members.length === 0 ? rest : { ...rest, allOf: members }
    }
  }
  return { type, schema: out }
}

/** @private */
const isNumberEncoding = (schema: Fragment): boolean => {
  const anyOf = schema["anyOf"]
  if (!Array.isArray(anyOf) || anyOf.length !== 2 || !isObject(anyOf[0]) || anyOf[0]["type"] !== "number") return false
  const special: unknown = anyOf[1]
  if (!isObject(special) || special["type"] !== "string") return false
  const values = special["enum"]
  return Array.isArray(values) && values.length === 3 && values.includes("NaN") && values.includes("Infinity") &&
    values.includes("-Infinity")
}

// Keep this allowlist closed: applicators and dependent keywords can change meaning when moved across schema objects.
/** @private */
const inlineableCheckKeywords =
  "|type|format|pattern|multipleOf|minimum|maximum|exclusiveMinimum|exclusiveMaximum|minLength|maxLength|minItems|maxItems|uniqueItems|minProperties|maxProperties|propertyNames|"

// `format` and `content*` can affect validation, so they are not treated as pure annotations.
/** @private */
const promotableAnnotationKeywords = "|title|description|default|examples|readOnly|writeOnly|"

/** @private */
const inlineableAnnotatedCheckKeywords = inlineableCheckKeywords + promotableAnnotationKeywords

/** @private */
const hasOnlyKeywords = (schema: Fragment, allowed: string): boolean =>
  Object.keys(schema).every((key) => allowed.includes(`|${key}|`))

/** @private */
const hasNoCollisions = (left: Fragment, rightKeys: ReadonlyArray<string>): boolean =>
  typeof left["$ref"] !== "string" && rightKeys.every((key) => !Object.hasOwn(left, key))

/**
 * Adds a constraint to a schema: inline when no keyword collides, otherwise
 * under `allOf`. A repeated bound is never merged into the tighter one.
 *
 * @private
 */
const appendJsonSchema = (left: Fragment, right: Fragment, inlineCheck?: true): Fragment => {
  if (Object.keys(left).length === 0) return right
  const rightKeys = Object.keys(right)
  if (rightKeys.length === 0) return left
  const leftType = left["type"] === "number" || left["type"] === "integer" ? left["type"] : undefined
  const numberEncoding = isNumberEncoding(left)
  if (leftType !== undefined || numberEncoding) {
    const extracted = extractNumberType(right)
    if (extracted.type !== undefined) {
      const type = leftType === "integer" || extracted.type === "integer" ? "integer" : "number"
      const base: Fragment = { ...left, type }
      if (numberEncoding) delete base["anyOf"]
      const extractedKeys = Object.keys(extracted.schema)
      if (extractedKeys.length === 0) return base
      return hasOnlyKeywords(extracted.schema, promotableAnnotationKeywords) && hasNoCollisions(base, extractedKeys)
        ? { ...base, ...extracted.schema }
        : appendJsonSchema(base, extracted.schema, inlineCheck)
    }
  }
  if (inlineCheck && hasNoCollisions(left, rightKeys)) return { ...left, ...right }
  const rightAllOf = right["allOf"]
  const members: ReadonlyArray<unknown> = Array.isArray(rightAllOf) && rightKeys.length === 1 ? rightAllOf : [right]
  const leftAllOf = left["allOf"]
  if (Array.isArray(leftAllOf)) return { ...left, allOf: [...leftAllOf, ...members] }
  if (typeof left["$ref"] === "string") return { allOf: [left, ...members] }
  return { ...left, allOf: members }
}

/** @private */
const jsonSchemaTypes: ReadonlySet<unknown> = new Set([
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "null",
  "integer"
])

/** @private */
const isJsonSchemaType = (input: unknown): input is JsonSchema.Type => jsonSchemaTypes.has(input)

/**
 * Collapses a union of single-type enums into one enum, the way a union of
 * literals reads.
 *
 * @private
 */
const compactEnums = (schemas: ReadonlyArray<Fragment>): Fragment | undefined => {
  let sharedType: unknown = undefined
  const values: Array<unknown> = []
  for (const schema of schemas) {
    const members = schema["enum"]
    if (
      Object.keys(schema).length !== 2 || schema["type"] === undefined || !Array.isArray(members) ||
      members.length === 0
    ) {
      return undefined
    }
    if (sharedType === undefined) sharedType = schema["type"]
    else if (schema["type"] !== sharedType) return undefined
    for (const value of members) {
      if (values.includes(value)) return undefined
      values.push(value)
    }
  }
  return { type: sharedType, enum: values }
}

/** @private */
const partPattern = (part: Representation): string => {
  switch (part._tag) {
    case "Literal":
      return escapeRegExp(String(part.literal))
    case "String":
      return stringPattern
    case "Number":
      return finitePattern
    case "TemplateLiteral":
      return part.parts.map(partPattern).join("")
    case "Union":
      return `(?:${part.types.map(partPattern).join("|")})`
    default:
      throw invalid("Invalid schema representation document", [])
  }
}

/** @private */
const neverSchema: Fragment = { not: {} }

/**
 * Refuses a representation kind this module does not print. A later `effect`
 * release that adds one fails here by name, not as a missing property.
 *
 * @private
 */
const unsupported = (representation: never, path: Path): never => {
  throw invalid(`Unsupported schema representation ${(representation as { readonly _tag: string })._tag}`, path)
}

/**
 * Prints a representation document as the JSON Schema document rc.115
 * printed for it under the same options.
 *
 * Reserved for {@link schemaIdentity} and for the tests that hand it a
 * representation no schema produces.
 *
 * @since 1.0.0
 * @private
 */
export const fromRepresentation = (document: SchemaRepresentation.Document, options?: Options): Document => {
  const closed = options?.onExcessProperty === "error"
  const references = document.references
  // A key maps to its compiled schema, to the key it is an alias of, or to
  // `null` while it is compiling.
  const definitionStates = new Map<string, Fragment | string | null>()
  const compiledRepresentations = new WeakMap<Representation, Fragment>()
  const fallbackDefinitions = new Map<string, Array<string>>()

  const compileDefinition = (key: string, path: Path): string => {
    const compiled = definitionStates.get(key)
    if (compiled !== undefined) return typeof compiled === "string" ? compiled : key
    const representation = Object.hasOwn(references, key) ? references[key] : undefined
    if (representation === undefined) throw invalid(`Invalid reference ${key}`, [...path, "$ref"])

    definitionStates.set(key, null)
    const schema = recur(representation, ["references", key])

    const fallback = identifierFallback(representation)
    if (fallback !== undefined) {
      const candidates = fallbackDefinitions.get(fallback)
      const match = candidates?.find((candidate) => sameJson(definitionStates.get(candidate), schema))
      if (match === undefined) {
        if (candidates === undefined) fallbackDefinitions.set(fallback, [key])
        else candidates.push(key)
      } else {
        definitionStates.set(key, match)
        return match
      }
    }
    definitionStates.set(key, schema)
    return key
  }

  const finalize = (schema: Fragment): Fragment =>
    rewriteRefs(schema, (reference) => {
      const pointer = decodeUriFragment(reference)
      if (pointer === undefined) {
        if (/^#(?:\/|%2f)/i.test(reference)) {
          throw new SchemaIdentityError({ message: `Invalid JSON Pointer URI fragment ${JSON.stringify(reference)}` })
        }
        return reference
      }
      if (!pointer.startsWith("/$defs/")) return reference
      const separator = pointer.indexOf("/", 7)
      const canonical = definitionStates.get(unescapeToken(pointer.slice(7, separator < 0 ? undefined : separator)))
      if (typeof canonical !== "string") return reference
      // URI-encoded slashes separate pointer tokens; only ~1 represents a slash within a token.
      return reference.replace(/^#(?:\/|%2f).*?(?:\/|%2f).*?(?=\/|%2f|$)/i, definitionReference(canonical))
    })

  const identifierFallback = (representation: Representation): string | undefined => {
    if (representation._tag === "Reference") return undefined
    const last = representation.checks.at(-1)
    const annotations = last === undefined ? representation.annotations : last.annotations
    const fallback = annotations?.["~identifier"]
    return typeof annotations?.["identifier"] !== "string" && typeof fallback === "string" ? fallback : undefined
  }

  const compileCheck = (
    check: Check,
    type: JsonSchema.Type | undefined,
    path: Path
  ): readonly [schema: Fragment, inline?: true] | undefined => {
    const source = fragmentSource(check)
    if (source !== undefined) {
      const schemas = check.representation?.schemas?.map((schema, index) =>
        recur(schema, [...path, "representation", "schemas", index])
      ) ?? []
      const fragment = source({ type, schemas })
      const ordinary = ordinaryAnnotations(check.annotations)
      const schema = ordinary === undefined ? fragment : { ...fragment, ...ordinary }
      const allowed = ordinary === undefined ? inlineableCheckKeywords : inlineableAnnotatedCheckKeywords
      return check._tag === "Filter" && hasOnlyKeywords(schema, allowed) &&
          (ordinary === undefined || hasOnlyKeywords(ordinary, promotableAnnotationKeywords))
        ? [schema, true]
        : [schema]
    }
    if (check._tag === "Filter") return undefined

    const allOf: Array<Fragment> = []
    check.checks.forEach((child, index) => {
      const compiled = compileCheck(child, type, [...path, "checks", index])
      if (compiled !== undefined) allOf.push(compiled[0])
    })
    if (allOf.length === 0) return undefined
    const ordinary = ordinaryAnnotations(check.annotations)
    return [ordinary === undefined ? { allOf } : { allOf, ...ordinary }]
  }

  const recur = (representation: Representation, path: Path): Fragment => {
    if (representation._tag === "Reference") {
      return { $ref: definitionReference(compileDefinition(representation.$ref, path)) }
    }
    const cached = compiledRepresentations.get(representation)
    if (cached !== undefined) return cached

    let output = on(representation, path)
    const ordinary = ordinaryAnnotations(representation.annotations)
    if (ordinary !== undefined) output = { ...output, ...ordinary }
    representation.checks.forEach((check, index) => {
      const compiled = compileCheck(
        check,
        isJsonSchemaType(output["type"]) ? output["type"] : undefined,
        [...path, "checks", index]
      )
      if (compiled !== undefined) output = appendJsonSchema(output, ...compiled)
    })
    compiledRepresentations.set(representation, output)
    return output
  }

  const annotated = (compiled: Fragment, annotations: Schema.Annotations.Annotations | undefined): Fragment => {
    const ordinary = ordinaryAnnotations(annotations)
    return ordinary === undefined ? compiled : appendJsonSchema(compiled, ordinary)
  }

  const on = (representation: Exclude<Representation, SchemaRepresentation.Reference>, path: Path): Fragment => {
    switch (representation._tag) {
      case "Any":
      case "Unknown":
      case "Declaration":
        return {}
      case "ObjectKeyword":
        return { anyOf: [{ type: "object" }, { type: "array" }] }
      case "Void":
      case "Undefined":
      case "Null":
        return { type: "null" }
      case "BigInt":
        return { type: "string", allOf: [{ pattern: bigIntPattern }] }
      case "Symbol":
        return { type: "string", allOf: [{ pattern: symbolPattern }] }
      case "UniqueSymbol":
        return Symbol.keyFor(representation.symbol) === undefined
          ? { not: {} }
          : { type: "string", enum: [String(representation.symbol)] }
      case "Suspend":
        return recur(representation.thunk, [...path, "thunk"])
      case "Never":
        return { not: {} }
      case "String":
        return { type: "string" }
      case "Number":
        return { anyOf: [{ type: "number" }, { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }] }
      case "Boolean":
        return { type: "boolean" }
      case "Literal": {
        const literal = representation.literal
        return typeof literal === "bigint"
          ? { type: "string", enum: [String(literal)] }
          : { type: typeof literal, enum: [literal] }
      }
      case "Enum": {
        const types = representation.enums.map(([title, literal], index) => {
          if (typeof literal === "number" && !Number.isFinite(literal)) {
            throw invalid(`Invalid numeric enum value ${String(literal)}`, [...path, "enums", index, 1])
          }
          return { type: typeof literal, enum: [literal], title }
        })
        return types.length === 0 ? { not: {} } : { anyOf: types }
      }
      case "TemplateLiteral":
        return { type: "string", pattern: `^${representation.parts.map(partPattern).join("")}$` }
      case "Arrays": {
        const rest = representation.rest[0]
        if (representation.rest.length > 1) {
          throw invalid("Invalid schema representation document", [...path, "rest"])
        }
        const out: Fragment = { type: "array" }
        let minItems = representation.elements.length
        const prefixItems = representation.elements.map((element, index) => {
          if (element.isOptional) minItems--
          return annotated(recur(element.type, [...path, "elements", index, "type"]), element.annotations)
        })
        if (prefixItems.length > 0) {
          out["prefixItems"] = prefixItems
          out["maxItems"] = representation.elements.length
          if (minItems > 0) out["minItems"] = minItems
        } else {
          out["items"] = false
        }
        if (rest !== undefined) {
          delete out["maxItems"]
          const items = recur(rest, [...path, "rest", 0])
          if (Object.keys(items).length > 0) out["items"] = items
          else delete out["items"]
        }
        return out
      }
      case "Objects": {
        if (representation.propertySignatures.length === 0 && representation.indexSignatures.length === 0) {
          return { not: { type: "null" } }
        }
        const out: Fragment = { type: "object" }
        const properties: Record<string, Fragment> = {}
        const required: Array<string> = []
        representation.propertySignatures.forEach((property, index) => {
          const name = property.name
          if (typeof name !== "string") {
            throw invalid("Invalid schema representation document", [...path, "propertySignatures", index, "name"])
          }
          assignProperty(
            properties,
            name,
            annotated(recur(property.type, [...path, "propertySignatures", index, "type"]), property.annotations)
          )
          if (!property.isOptional) required.push(name)
        })
        if (representation.propertySignatures.length > 0) out["properties"] = properties
        if (required.length > 0) out["required"] = required
        const patternProperties: Record<string, Fragment | false> = {}
        const additionalPropertySchemas: Array<Fragment | false> = []
        const indexValueSchemas: Array<Fragment | false> = []
        let hasUnrepresentableIndexPattern = false
        representation.indexSignatures.forEach((signature, index) => {
          const compiled = recur(signature.type, [...path, "indexSignatures", index, "type"])
          const type = sameJson(compiled, neverSchema) ? false : compiled
          indexValueSchemas.push(type)
          const patterns = parameterPatterns(
            signature.parameter,
            [...path, "indexSignatures", index, "parameter"],
            new Set()
          )
          if (patterns === undefined) {
            hasUnrepresentableIndexPattern = true
          } else if (patterns.length === 0) {
            additionalPropertySchemas.push(type)
          } else {
            for (const key of patterns) {
              const previous = Object.hasOwn(patternProperties, key) ? patternProperties[key] : undefined
              assignProperty(
                patternProperties,
                key,
                previous === undefined
                  ? type
                  : previous === false || type === false
                  ? false
                  : appendJsonSchema(previous, type)
              )
            }
          }
        })
        const hasPatternProperties = Object.keys(patternProperties).length > 0
        if (hasPatternProperties) out["patternProperties"] = patternProperties
        const additional = additionalPropertySchemas.map((type) => ({ type: "object", additionalProperties: type }))
        if (hasUnrepresentableIndexPattern && closed) {
          const propertyNames: Array<Fragment> = []
          if (representation.propertySignatures.length > 0) propertyNames.push({ enum: Object.keys(properties) })
          representation.indexSignatures.forEach((signature, index) => {
            propertyNames.push(recur(signature.parameter, [...path, "indexSignatures", index, "parameter"]))
          })
          out["propertyNames"] = propertyNames.length === 1 ? propertyNames[0] : { anyOf: propertyNames }
          out["additionalProperties"] = indexValueSchemas.length === 1
            ? indexValueSchemas[0]
            : { anyOf: indexValueSchemas }
          if (additional.length > 0) out["allOf"] = additional
        } else if (additional.length === 0) {
          out["additionalProperties"] = hasUnrepresentableIndexPattern || !closed
        } else if (
          additionalPropertySchemas.length === 1 && representation.propertySignatures.length === 0 &&
          !hasPatternProperties
        ) {
          out["additionalProperties"] = additionalPropertySchemas[0]
        } else {
          out["allOf"] = additional
        }
        const additionalProperties = out["additionalProperties"]
        if (isObject(additionalProperties) && Object.keys(additionalProperties).length === 0) {
          delete out["additionalProperties"]
        }
        return out
      }
      case "Union": {
        const types = representation.types.map((type, index) => recur(type, [...path, "types", index]))
        if (types.length === 0) return { not: {} }
        const mode = representation.options?.mode ?? "anyOf"
        if (mode === "anyOf" && types.length > 1) {
          const compacted = compactEnums(types)
          if (compacted !== undefined) return compacted
        }
        return mode === "anyOf" ? { anyOf: types } : { oneOf: types }
      }
      default:
        return unsupported(representation, path)
    }
  }

  const parameterPatterns = (
    parameter: Representation,
    path: Path,
    seenReferences: ReadonlySet<string>
  ): ReadonlyArray<string> | undefined => {
    switch (parameter._tag) {
      case "Reference": {
        const target = Object.hasOwn(references, parameter.$ref) ? references[parameter.$ref] : undefined
        if (target === undefined) throw invalid(`Invalid reference ${parameter.$ref}`, [...path, "$ref"])
        compileDefinition(parameter.$ref, path)
        if (seenReferences.has(parameter.$ref)) return undefined
        return parameterPatterns(target, ["references", parameter.$ref], new Set(seenReferences).add(parameter.$ref))
      }
      case "String": {
        const check = parameter.checks[0]
        if (check === undefined) return []
        if (parameter.checks.length !== 1 || check._tag !== "Filter" || fragmentSource(check) === undefined) {
          return undefined
        }
        const schema = recur(parameter, path)
        const key = schema["pattern"]
        return schema["type"] === "string" && typeof key === "string" &&
            hasOnlyKeywords(schema, "|type|pattern|title|description|default|examples|readOnly|writeOnly|")
          ? [key]
          : undefined
      }
      case "TemplateLiteral":
        return parameter.checks.length === 0 ? [`^${parameter.parts.map(partPattern).join("")}$`] : undefined
      case "Union": {
        if (parameter.types.length === 0 || parameter.checks.length > 0 || parameter.options?.mode === "oneOf") {
          return undefined
        }
        const patterns: Array<string> = []
        for (const [index, member] of parameter.types.entries()) {
          const memberPatterns = parameterPatterns(member, [...path, "types", index], seenReferences)
          if (memberPatterns === undefined) return undefined
          if (memberPatterns.length === 0) return []
          patterns.push(...memberPatterns)
        }
        return patterns
      }
      default:
        throw invalid("Invalid schema representation document", path)
    }
  }

  const referenceKeys = Object.keys(references)
  for (const key of referenceKeys) compileDefinition(key, ["references", key])
  const schema = finalize(recur(document.representation, ["representation"]))
  const definitions: Record<string, Fragment> = {}
  for (const key of referenceKeys) {
    const compiled = definitionStates.get(key)
    if (isObject(compiled)) assignProperty(definitions, key, finalize(compiled))
  }
  return { dialect: "draft-2020-12", schema, definitions }
}

/**
 * The identity a schema contributes: a pure function of the schema and the
 * option, and of nothing the installed `effect` release prints. It takes the
 * place of `Schema.toJsonSchemaDocument(schema, options)` wherever the
 * document is hashed, compared or pinned.
 *
 * Throws what rc.115 threw for a schema with no JSON Schema form: more than
 * one rest element, a record key that is neither a string nor a template, a
 * `toJsonSchema` annotation that throws.
 *
 * @since 1.0.0
 * @private
 */
export const schemaIdentity = (schema: Schema.Top, options?: Options): Document =>
  fromRepresentation(Schema.toRepresentation(Schema.toCodecJson(schema)), options)

/**
 * The six built-in checks `effect` renamed after `4.0.0-rc.115`, from the id
 * a later release writes to the id rc.115 wrote. Their payloads and
 * annotations did not change.
 *
 * @private
 */
const rc115CheckIds: ReadonlyMap<string, string> = new Map([
  ["effect/schema/isStartingWith", "effect/schema/isStartsWith"],
  ["effect/schema/isEndingWith", "effect/schema/isEndsWith"],
  ["effect/schema/isIncluding", "effect/schema/isIncludes"],
  ["effect/schema/isBetweenLength", "effect/schema/isLengthBetween"],
  ["effect/schema/isBetweenSize", "effect/schema/isSizeBetween"],
  ["effect/schema/isBetweenProperties", "effect/schema/isPropertiesLengthBetween"]
])

/**
 * A copy of an encoded representation with every renamed check id written
 * back as rc.115 wrote it. Only an element of a `checks` array is a check.
 * `annotations` and `payload` hold an author's data, which may have any
 * shape, so they are copied as they are. Key order is kept, so the bytes
 * match.
 *
 * @private
 */
const withRc115CheckIds = (value: Schema.Json, isCheck = false): Schema.Json => {
  if (Array.isArray(value)) return value.map((member) => withRc115CheckIds(member, isCheck))
  if (!isObject(value)) return value
  const out: Record<string, Schema.Json> = {}
  for (const [key, member] of Object.entries(value as Readonly<Record<string, Schema.Json>>)) {
    if (key === "annotations" || key === "payload") {
      assignProperty(out, key, member)
      continue
    }
    const renamed = isCheck && key === "representation" && isObject(member) && typeof member["id"] === "string"
      ? rc115CheckIds.get(member["id"])
      : undefined
    assignProperty(
      out,
      key,
      renamed === undefined
        ? withRc115CheckIds(member, key === "checks")
        : withRc115CheckIds({ ...(member as Readonly<Record<string, Schema.Json>>), id: renamed })
    )
  }
  return out
}

/**
 * The representation identity of a schema AST: what
 * `SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(ast))`
 * returned under `effect@4.0.0-rc.115`, key order included. A sealed action's
 * step key hashes it, so it must not move with the installed `effect`.
 *
 * The installed release encodes the representation; this writes back the six
 * check ids renamed after rc.115. One difference cannot be undone: from
 * `effect@4.0.4` on, `Schema.brand` is not part of the AST, so the `brands`
 * annotation rc.115 wrote is absent and a declaration with a brand re-keys
 * once.
 *
 * Throws what rc.115 threw for an AST with no representation, such as one
 * whose check carries no `representation` annotation.
 *
 * @since 1.0.0
 * @private
 */
export const representationIdentity = (ast: SchemaAST.AST): Schema.Json =>
  withRc115CheckIds(SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(ast)))
