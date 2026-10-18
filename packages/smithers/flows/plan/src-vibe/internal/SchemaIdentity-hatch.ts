// A-1/B-4: preserve synchronous throwing validators; C-1: native catches; D-2: plain sibling TypeScript calls.
import type * as JsonSchema from "effect/JsonSchema"
import * as Schema from "effect/Schema"
import type * as SchemaAST from "effect/SchemaAST"
import * as SchemaRepresentation from "effect/SchemaRepresentation"
import type { Document, Options } from "./SchemaIdentity.vibe"
import { representationIdentity, SchemaIdentityError } from "./SchemaIdentity.vibe"
import type { Fragment, Path, Representation, Check, CheckInput, BuiltinCheck, NumberType } from "./SchemaIdentity-pure.vibe"
import { isObject, assignProperty, isJson, plainValues, escapeRegExp, unescapeToken, definitionReference, finitePattern, stringPattern, bigIntPattern, symbolPattern, uuidPattern, isNumber, isString, isVersion, isFlag, pattern, empty, isCheckCallback, isApproximate, inlineableCheckKeywords, promotableAnnotationKeywords, inlineableAnnotatedCheckKeywords, hasOnlyKeywords, hasNoCollisions, jsonSchemaTypes, isJsonSchemaType, neverSchema, rc115CheckIds, withRc115CheckIds } from "./SchemaIdentity-pure.vibe"
export const invalid = (message: string, path: Path): SchemaIdentityError =>
  new SchemaIdentityError({
    message: path.length === 0
      ? message
      : `${message}\n  at ${path.map((key) => `[${typeof key === "string" ? JSON.stringify(key) : key}]`).join("")}`
  })

export const sameJson = (left: unknown, right: unknown): boolean => {
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

export const decodeUriFragment = (fragment: string): string | undefined => {
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

export const rewriteRefs = (node: Fragment, rewrite: (reference: string) => string): Fragment => {
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

export const ordinaryAnnotations = (annotations: Schema.Annotations.Annotations | undefined): Fragment | undefined => {
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

export const field = <A>(id: string, payload: unknown, name: string, is: (value: unknown) => value is A): A => {
  const value = isObject(payload) ? payload[name] : undefined
  if (!is(value)) {
    throw new SchemaIdentityError({
      message: `Cannot derive a schema identity: check ${id} carries no usable "${name}" in its payload. ` +
        "The installed effect release describes this check differently from the releases @smthrs/plan supports."
    })
  }
  return value
}

export const literalPattern = (name: string, source: (escaped: string) => string): BuiltinCheck => (id, payload) => ({
  pattern: new RegExp(source(escapeRegExp(field(id, payload, name, isString)))).source
})

export const bound = (keyword: string, name: string = keyword): BuiltinCheck => (id, payload) => ({
  [keyword]: field(id, payload, name, isNumber)
})

export const length = (name: string, array: string, string: string): BuiltinCheck => (id, payload, input) => ({
  [input.type === "array" ? array : string]: field(id, payload, name, isNumber)
})

export const builtinChecks: ReadonlyMap<string, BuiltinCheck> = new Map<string, BuiltinCheck>([
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

export const builtinCheckIds: ReadonlyArray<string> = [...builtinChecks.keys()]

export const fragmentSource = (check: Check): ((input: CheckInput) => Fragment) | undefined => {
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

export const extractNumberType = (schema: Fragment): { readonly type: NumberType | undefined; readonly schema: Fragment } => {
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

export const isNumberEncoding = (schema: Fragment): boolean => {
  const anyOf = schema["anyOf"]
  if (!Array.isArray(anyOf) || anyOf.length !== 2 || !isObject(anyOf[0]) || anyOf[0]["type"] !== "number") return false
  const special: unknown = anyOf[1]
  if (!isObject(special) || special["type"] !== "string") return false
  const values = special["enum"]
  return Array.isArray(values) && values.length === 3 && values.includes("NaN") && values.includes("Infinity") &&
    values.includes("-Infinity")
}

export const appendJsonSchema = (left: Fragment, right: Fragment, inlineCheck?: true): Fragment => {
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

export const compactEnums = (schemas: ReadonlyArray<Fragment>): Fragment | undefined => {
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

export const partPattern = (part: Representation): string => {
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

export const unsupported = (representation: never, path: Path): never => {
  throw invalid(`Unsupported schema representation ${(representation as { readonly _tag: string })._tag}`, path)
}

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

export const schemaIdentity = (schema: Schema.Top, options?: Options): Document =>
  fromRepresentation(Schema.toRepresentation(Schema.toCodecJson(schema)), options)
