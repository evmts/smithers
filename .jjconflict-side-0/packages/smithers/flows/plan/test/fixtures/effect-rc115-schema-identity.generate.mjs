#!/usr/bin/env node
// Records what `effect@4.0.0-rc.115` printed for every schema of the identity
// corpus, as two fixtures in <directory>:
//
// - `effect-rc115-schema-identity.json`, its JSON Schema documents.
//   `SchemaIdentity.test.ts` holds `Node.schemaIdentity` to it.
// - `effect-rc115-representation-identity.json`, its representation
//   documents. `RepresentationIdentity.test.ts` holds
//   `Node.representationIdentity` to it.
//
//   node test/fixtures/effect-rc115-schema-identity.generate.mjs <checkout> <revision> <directory>
//
// <checkout> is a Smithers checkout whose install resolves `effect` to
// 4.0.0-rc.115; the script loads `effect` from it and reads nothing else there
// but its lockfile. <revision> is that checkout's source revision, recorded as
// given. Run it from this package; it refuses any other `effect` version,
// because a fixture printed by another release pins nothing.
//
// The corpus is `../SchemaIdentityCorpus.ts` as it stands here, so a new entry
// needs only a rerun. Node strips its types on import.
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { corpus, renamedSinceRc115, representations } from "../SchemaIdentityCorpus.ts"

const expected = "4.0.0-rc.115"
const [checkout, revision, directory] = process.argv.slice(2)
if (checkout === undefined || revision === undefined || directory === undefined) {
  throw new Error("usage: effect-rc115-schema-identity.generate.mjs <checkout> <revision> <directory>")
}

const require = createRequire(join(checkout, "packages/smithers/flows/plan/package.json"))
const version = require("effect/package.json").version
if (version !== expected) {
  throw new Error(`${checkout} resolves effect@${version}; this fixture is what effect@${expected} printed`)
}
const load = async (specifier) => import(pathToFileURL(require.resolve(specifier)).href)
const Schema = await load("effect/Schema")
const Effect = await load("effect/Effect")
const SchemaRepresentation = await load("effect/SchemaRepresentation")

const lock = readFileSync(join(checkout, "pnpm-lock.yaml"), "utf8")
const integrity = new RegExp(`^  effect@${expected.replaceAll(".", "\\.")}:\\n    resolution: \\{integrity: (\\S+)\\}`, "m")
  .exec(lock)?.[1]
if (integrity === undefined) throw new Error(`${checkout}/pnpm-lock.yaml records no integrity for effect@${expected}`)

// The corpus names checks as 4.0.4 does; rc.115 exported six of them under another name.
const S = { ...Schema }
for (const [name, before] of Object.entries(renamedSinceRc115)) S[name] = Schema[before]

// Both values of the one option an identity is taken under, each recorded in full.
const record = (options) => {
  const documents = {}
  const failures = {}
  for (const [name, build] of Object.entries(corpus(S, Effect))) {
    // A schema that cannot be built is a defect in the corpus, not a recording.
    const schema = build()
    try {
      documents[name] = JSON.stringify(Schema.toJsonSchemaDocument(schema, options))
    } catch (error) {
      // The same call in two steps, to say which one refused: the emitter's
      // message is this package's to reproduce, an earlier one is effect's own.
      let stage = "emitter"
      try {
        Schema.toRepresentation(Schema.toCodecJson(schema))
      } catch {
        stage = "representation"
      }
      failures[name] = { stage, message: String(error.message) }
    }
  }
  // Documents no schema constructor produces go to the emitter directly.
  const representationDocuments = {}
  const representationFailures = {}
  for (const [name, build] of Object.entries(representations(S))) {
    try {
      representationDocuments[name] = JSON.stringify(SchemaRepresentation.toJsonSchemaDocument(build(), options))
    } catch (error) {
      representationFailures[name] = String(error.message)
    }
  }
  return { options, documents, failures, representationDocuments, representationFailures }
}
const recordings = { error: record({ onExcessProperty: "error" }), ignore: record({ onExcessProperty: "ignore" }) }

const fixture = {
  producer: {
    source: { sha: revision },
    effect: version,
    package: { name: "effect", version, integrity },
    node: process.version,
    emitter: "Schema.toJsonSchemaDocument(schema, options)",
    generator: "packages/smithers/flows/plan/test/fixtures/effect-rc115-schema-identity.generate.mjs",
    note:
      "One recording per value of onExcessProperty. Each document is JSON.stringify of what the emitter above returned for the corpus entry of that name, key order included. Each failure is the message it threw, and whether the emitter or an earlier step threw it. The representation entries are the same for SchemaRepresentation.toJsonSchemaDocument(document, options). Nothing was regenerated under a newer effect."
  },
  recordings
}
writeFileSync(join(directory, "effect-rc115-schema-identity.json"), `${JSON.stringify(fixture, null, 2)}\n`)
for (const [mode, recording] of Object.entries(recordings)) {
  console.log(
    `effect@${version} onExcessProperty=${mode}: ${Object.keys(recording.documents).length} documents, ` +
      `${Object.keys(recording.failures).length} failures, ` +
      `${Object.keys(recording.representationDocuments).length} representation documents, ` +
      `${Object.keys(recording.representationFailures).length} representation failures`
  )
}

// The representation a step key hashes: `SchemaRepresentation.toJson` of the
// schema's own AST, the call `ActionKey.ts` made under rc.115.
const representationDocuments = {}
const representationFailures = {}
for (const [name, build] of Object.entries(corpus(S, Effect))) {
  try {
    representationDocuments[name] = JSON.stringify(
      SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(build().ast))
    )
  } catch (error) {
    representationFailures[name] = String(error.message)
  }
}
const representationFixture = {
  producer: {
    ...fixture.producer,
    emitter: "SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast))",
    note:
      "Each document is JSON.stringify of what the emitter above returned for the corpus entry of that name, key order included. Each failure is the message it threw. Nothing was regenerated under a newer effect."
  },
  documents: representationDocuments,
  failures: representationFailures
}
writeFileSync(
  join(directory, "effect-rc115-representation-identity.json"),
  `${JSON.stringify(representationFixture, null, 2)}\n`
)
console.log(
  `effect@${version} representations: ${Object.keys(representationDocuments).length} documents, ` +
    `${Object.keys(representationFailures).length} failures`
)
