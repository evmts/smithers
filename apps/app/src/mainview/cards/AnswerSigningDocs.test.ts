import { expect, test } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
const root = resolve(import.meta.dir, "../../../../..")
test("the owning flow docs publish the protocol, golden and enrollment/verifier duties", () => {
  const doc = readFileSync(resolve(root, "packages/smithers/flows/flow/docs/guides/signed-answers.md"), "utf8")
  for (const term of ["RFC 8785", "askId", "notBefore", "discoverable", "origin allowlist", "replayed askId", "Fv40wrBkEJzgrMK98cMsstf1TYjSu5oDuAxmyr_R4YU"]) expect(doc).toContain(term)
  expect(existsSync(resolve(root, "apps/app/ANSWER-SIGNING.md"))).toBe(false)
  for (const path of ["packages/smithers/flows/flow/docs/guides/ask-a-person.md", "packages/smithers/flows/flow/docs/api.md", "packages/smithers/flows/flow/src/internal/JsonSchemaSubset.ts"]) expect(readFileSync(resolve(root, path), "utf8")).toContain('`format` (`webauthn-assertion` only)')
})
