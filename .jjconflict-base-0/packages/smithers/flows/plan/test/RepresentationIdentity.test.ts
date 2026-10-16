/**
 * A sealed action's step key must not depend on the `effect` release the
 * application installed.
 *
 * The key folds in `SchemaRepresentation.toJson` of the action's success and
 * error schemas. `effect@4.0.4` renamed six built-in checks, so the installed
 * encoder writes a different document than `4.0.0-rc.115` did for any schema
 * that uses one, and every recorded step behind such a schema would re-key.
 * `Node.representationIdentity` writes the rc.115 document.
 *
 * The fixture beside this file is what rc.115 wrote for every schema in
 * `SchemaIdentityCorpus.ts`, produced by
 * `fixtures/effect-rc115-schema-identity.generate.mjs` from the rc.115 tarball
 * its `producer` block names. Nothing here regenerates it.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaRepresentation from "effect/SchemaRepresentation"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as Node from "../src/Node.ts"
import { corpus } from "./SchemaIdentityCorpus.ts"

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/effect-rc115-representation-identity.json", import.meta.url), "utf8")
) as {
  readonly producer: { readonly effect: string; readonly package: { readonly integrity: string } }
  readonly documents: Readonly<Record<string, string>>
  readonly failures: Readonly<Record<string, string>>
}

const schemas = corpus(Schema, Effect)

/**
 * The corpus entries whose rc.115 document carries a `brands` annotation.
 * From `effect@4.0.4` on a brand is not part of the AST, so nothing an
 * identity reads can restore it: a declaration with one of these schemas
 * re-keys once.
 */
const branded = [
  "brand/string",
  "brand/checked",
  "brand/identified",
  "brand/reuse",
  "brand/identified-reuse",
  "brand/identified-then-branded",
  "brand/struct",
  "brand/int",
  "brand/twice"
]

/** A document with every `brands` annotation removed, and an emptied `annotations` with it. */
const withoutBrands = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutBrands)
  if (typeof value !== "object" || value === null) return value
  const entries = Object.entries(value).filter(([key]) => key !== "brands").map(([key, member]) =>
    [key, withoutBrands(member)] as const
  )
  return Object.fromEntries(
    entries.filter(([key, member]) => !(key === "annotations" && Object.keys(member as object).length === 0))
  )
}

const printed = (name: string): string => JSON.stringify(Node.representationIdentity(schemas[name]!().ast))

describe("representation identity under an effect upgrade", () => {
  it("is held to the reviewed rc.115 tarball", () => {
    expect(fixture.producer.effect).toBe("4.0.0-rc.115")
    expect(fixture.producer.package.integrity).toBe(
      "sha512-ogYulZ5ffeOzrJqQrG0XOkDO5lKn2s9KNHhoxJy/6wKUkF0i12dlVXWA9TgsgQ+zV/JzizyG0+XMPepZEQX6vw=="
    )
  })

  it("records every schema of the corpus", () => {
    expect([...Object.keys(fixture.documents), ...Object.keys(fixture.failures)].sort())
      .toEqual(Object.keys(schemas).sort())
  })

  it("names exactly the corpus entries rc.115 wrote a brand into", () => {
    expect(Object.keys(fixture.documents).filter((name) => fixture.documents[name]!.includes("\"brands\"")))
      .toEqual(branded)
  })

  // Compared as text: the key order is part of what a canonical writer hashes.
  it.each(Object.keys(fixture.documents).filter((name) => !branded.includes(name)))(
    "writes %s as rc.115 wrote it",
    (name) => {
      expect(printed(name)).toBe(fixture.documents[name])
    }
  )

  it.each(branded)("writes %s as rc.115 wrote it, less the brand", (name) => {
    expect(printed(name)).not.toBe(fixture.documents[name])
    expect(printed(name)).toBe(JSON.stringify(withoutBrands(JSON.parse(fixture.documents[name]!))))
  })

  it.each(Object.entries(fixture.failures))("refuses %s as rc.115 refused it", (name, message) => {
    expect(() => Node.representationIdentity(schemas[name]!().ast)).toThrow(expect.objectContaining({ message }))
  })

  it("is the installed encoding with the renamed check ids written back", () => {
    // The premise of the module, stated where it can fail: the installed
    // release writes the 4.0.4 id, and the identity writes the rc.115 one.
    const ast = Schema.String.check(Schema.isStartingWith("a")).ast
    expect(JSON.stringify(SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(ast))))
      .toContain("\"effect/schema/isStartingWith\"")
    expect(JSON.stringify(Node.representationIdentity(ast))).toContain("\"effect/schema/isStartsWith\"")
  })
})
