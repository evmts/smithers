import assert from "node:assert/strict"
import test from "node:test"
import { declaredRanges } from "./check-lockfile-parity.mjs"

test("an optional peer named only in peerDependenciesMeta is a peer of any version, as Bun records it", () => {
  const pkg = {
    peerDependencies: { effect: "^4.0.4", "@effect/sql-pg": "^4.0.4" },
    peerDependenciesMeta: {
      "@effect/sql-pg": { optional: true },
      "@effect/sql-sqlite-node": { optional: true },
      "@effect/vitest": { optional: false }
    },
    dependencies: { undici: "8.11.2" }
  }
  assert.deepEqual(declaredRanges(pkg, "peerDependencies"), {
    effect: "^4.0.4",
    "@effect/sql-pg": "^4.0.4",
    "@effect/sql-sqlite-node": "*"
  })
  assert.deepEqual(declaredRanges(pkg, "dependencies"), { undici: "8.11.2" })
  assert.deepEqual(declaredRanges({}, "peerDependencies"), {})
  assert.deepEqual(declaredRanges({ peerDependenciesMeta: { a: { optional: true } } }, "devDependencies"), {})
})
