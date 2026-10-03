import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import { readFileSync } from "node:fs"
import * as ts from "typescript"
import { describe, expect, it } from "vitest"
import { Canonical, CanonicalError, canonicalize } from "../src/index.ts"

const guide = readFileSync(new URL("../docs/guides/use-the-schema.md", import.meta.url), "utf8")

// Execute the published reporting helper, so copying the guide has the same
// privacy contract as the assertions below.
const reportingExample = (name: string): (cause: unknown) => unknown => {
  const fence = [...guide.matchAll(/```ts\n([\s\S]*?)```/g)]
    .map((match) => match[1]!)
    .find((code) => code.includes(`const ${name} =`))
  if (fence === undefined) throw new Error(`Missing documentation example: ${name}`)
  const { outputText } = ts.transpileModule(fence.replace(/^import .*$/gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  })
  return new Function("CanonicalError", `${outputText}\nreturn ${name}`)(CanonicalError)
}

const failure = (value: unknown): CanonicalError => {
  try {
    canonicalize(value)
  } catch (error) {
    if (error instanceof CanonicalError) return error
    throw error
  }
  throw new Error("Expected canonicalization to fail")
}

const secretKey = "SYNTHETIC_SECRET_KEY"
const secretText = "SYNTHETIC_SECRET_VALUE"
const keyedInput = { records: { [secretKey]: { value: NaN } } }
const throwingInput = {
  toJSON() {
    throw new Error(secretText)
  }
}

describe("documented diagnostic boundaries", () => {
  it("forces the documented derived parser's policy even when the caller requests input", () => {
    const code = [...guide.matchAll(/```ts\n([\s\S]*?)```/g)]
      .map((match) => match[1]!)
      .filter((example) => example.includes("const decode =") || example.includes("class FingerprintError") ||
        example.includes("const FingerprintTransformation ="))
      .join("\n")
      .replace(/^import .*$/gm, "")
    const { outputText } = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    })
    const fingerprint: Schema.Codec<string, unknown> = new Function(
      "Canonical", "Effect", "Schema", "SchemaGetter", "SchemaIssue", "SchemaParser",
      `${outputText}\nreturn Fingerprint`
    )(Canonical, Effect, Schema, SchemaGetter, SchemaIssue, SchemaParser)

    expect(Schema.decodeUnknownSync(fingerprint)({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
    const input = { secret: secretText, value: NaN }
    const error = Effect.runSync(Effect.flip(
      Schema.decodeUnknownEffect(fingerprint)(input, { reportInput: true })
    ))
    expect(error.message).toContain("[canonicalization_failed] $")
    expect(JSON.stringify(error)).not.toContain(secretText)
    const encoded = Effect.runSync(Effect.flip(Schema.encodeUnknownEffect(fingerprint)("{}")))
    expect(encoded.message).toContain("A fingerprint cannot be converted back into its input")

    const enclosing = Schema.Struct({ value: fingerprint, sibling: Schema.Number })
    const composedInput = { value: input, sibling: "invalid" }
    const retained = Effect.runSync(Effect.flip(
      Schema.decodeUnknownEffect(enclosing)(composedInput, { reportInput: true, errors: "all" })
    ))
    expect(JSON.stringify(retained)).toContain(secretText)
    const suppressed = Effect.runSync(Effect.flip(
      Schema.decodeUnknownEffect(enclosing)(composedInput, { reportInput: false, errors: "all" })
    ))
    expect(JSON.stringify(suppressed)).not.toContain(secretText)
  })

  it.each([
    ["record member names", keyedInput],
    ["callback exception text", throwingInput],
    ["getter exception text", {
      get value() {
        throw new Error(secretText)
      }
    }]
  ])("reports only the stable code by default for %s", (_label, input) => {
    const error = failure(input)
    expect(reportingExample("issueOf")(error)).toBe(error.code)
  })

  it("allowlists complete public paths and redacts dynamic keys and exception text", () => {
    const report = reportingExample("detailedIssueOf")
    for (const key of [secretKey, "fake@example.test", "tags.SYNTHETIC_SECRET_KEY"]) {
      const error = failure({
        input: {
          [key]: {
            toJSON() {
              throw new Error(secretText)
            }
          }
        }
      })
      expect(report(error)).toEqual({
        code: "canonical_tojson_threw",
        path: "$[redacted]",
        message: "[redacted]",
        cause: "[redacted]"
      })
    }
    expect(report(failure({ input: { tags: new Set() } }))).toEqual({
      code: "canonical_unsupported_value",
      path: "$.input.tags",
      message: "[redacted]",
      cause: "[redacted]"
    })
    expect(report(new Error(secretText))).toEqual({ code: "canonicalization_failed" })
    expect(reportingExample("issueOf")(new Error(secretText))).toBe("canonicalization_failed")
  })

  it("retains the rejected input only when reportInput is true", () => {
    const input = { [secretKey]: secretText, value: NaN }
    const rendered = (options: { readonly reportInput?: boolean }): string =>
      JSON.stringify(Effect.runSync(Effect.flip(Schema.decodeUnknownEffect(Canonical)(input, options))))
    expect(rendered({})).not.toContain(secretText)
    expect(rendered({ reportInput: false })).not.toContain(secretText)
    expect(rendered({ reportInput: true })).toContain(secretText)
  })

  it("demonstrates that reportInput false does not redact paths or custom messages", () => {
    expect(failure(keyedInput).path).toBe(`$.records.${secretKey}.value`)
    expect(failure(throwingInput).cause).toEqual(new Error(secretText))
    for (const [input, secret] of [[keyedInput, secretKey], [throwingInput, secretText]] as const) {
      const error = Effect.runSync(Effect.flip(
        Schema.decodeUnknownEffect(Canonical)(input, { reportInput: false })
      ))
      expect(error.message).toContain(secret)
    }
  })
})
