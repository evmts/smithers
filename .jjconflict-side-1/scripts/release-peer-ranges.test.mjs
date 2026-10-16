import assert from "node:assert/strict"
import test from "node:test"
import { peerRangesOf } from "./release-peer-ranges.mjs"

test("release consumers satisfy all peer contracts, including union ranges", () => {
  const peers = peerRangesOf([
    { peerDependencies: { vitest: "^4.1.9 || ^5.0.0", effect: "^4.0.4", "@smthrs/flow": "workspace:*" } },
    { peerDependencies: { vitest: "4.1.9", effect: "^4.0.4" } },
    {}
  ])
  assert.equal(peers.get("vitest"), "^4.1.9 4.1.9 || ^5.0.0 4.1.9")
  assert.equal(peers.get("effect"), "^4.0.4")
  assert.equal(peers.has("@smthrs/flow"), false)
})

test("minimal consumers select only required peers and explicitly requested optional adapters", () => {
  const manifests = [{ peerDependencies: { effect: "^4.0.4", node: "1", browser: "2" },
    peerDependenciesMeta: { node: { optional: true }, browser: { optional: true } } }]
  assert.deepEqual([...peerRangesOf(manifests, { optionalPeers: [] })], [["effect", "^4.0.4"]])
  assert.deepEqual([...peerRangesOf(manifests, { optionalPeers: ["node"] })], [["effect", "^4.0.4"], ["node", "1"]])
  assert.equal(peerRangesOf(manifests).get("browser"), "2")
})

test("selected first-party peers retain their exact release contracts", () => {
  const manifests = [{ peerDependencies: { "@smthrs/platform-node": "1.0.0-rc.0", "@smthrs/testing": "1.0.0-rc.0" },
    peerDependenciesMeta: { "@smthrs/testing": { optional: true } } }]
  assert.deepEqual([...peerRangesOf(manifests, { optionalPeers: [], includeFirstParty: true })], [["@smthrs/platform-node", "1.0.0-rc.0"]])
  assert.deepEqual([...peerRangesOf(manifests, { optionalPeers: ["@smthrs/testing"], includeFirstParty: true })],
    [["@smthrs/platform-node", "1.0.0-rc.0"], ["@smthrs/testing", "1.0.0-rc.0"]])
})

test("an executable selects an optional adapter and all selected consumers constrain its range", () => {
  const library = { peerDependencies: { sqlite: "^1", vitest: "^4.1.9 || ^5.0.0" },
    peerDependenciesMeta: { sqlite: { optional: true }, vitest: { optional: true } } }
  for (const executable of [{ dependencies: { sqlite: "1.2.0" } }, { peerDependencies: { sqlite: "1.2.0" } }]) {
    const peers = peerRangesOf([library, executable], { optionalPeers: [] })
    assert.equal(peers.has("sqlite"), true)
    assert.equal(peers.has("vitest"), false)
  }
  assert.equal(peerRangesOf([library, { peerDependencies: { vitest: "4.1.9" } }], { optionalPeers: [] }).get("vitest"),
    "^4.1.9 4.1.9 || ^5.0.0 4.1.9")
})

test("an explicitly installed first-party facade selects its optional peer contract", () => {
  const manifests = [
    { name: "@smthrs/recording-fixture", peerDependencies: { "@smthrs/testing": "1.0.0-rc.0" },
      peerDependenciesMeta: { "@smthrs/testing": { optional: true } } },
    { name: "@smthrs/testing", version: "1.0.0-rc.0" }
  ]
  assert.deepEqual([...peerRangesOf(manifests, { optionalPeers: [], includeFirstParty: true })],
    [["@smthrs/testing", "1.0.0-rc.0"]])
})

test("peer selection preserves single-use manifest iterators", () => {
  const manifests = new Map([
    ["library", { peerDependencies: { effect: "^4.0.4", sqlite: "1" },
      peerDependenciesMeta: { sqlite: { optional: true } } }],
    ["cli", { dependencies: { sqlite: "1" } }]
  ])
  assert.deepEqual([...peerRangesOf(manifests.values(), { optionalPeers: [] })],
    [["effect", "^4.0.4"], ["sqlite", "1"]])
})

test("a library's ranged adapter peer and an executable's exact one select the exact version", () => {
  // The published shape: the database library accepts any driver in the
  // supported range, and the executable asks for the one built for the Effect
  // it installs. The smoke installs the intersection, which only that version meets.
  const library = { peerDependencies: { effect: "^4.0.4", "@effect/sql-sqlite-node": "^4.0.4" },
    peerDependenciesMeta: { "@effect/sql-sqlite-node": { optional: true } } }
  const executable = { dependencies: { effect: "4.0.4" }, peerDependencies: { "@effect/sql-sqlite-node": "4.0.4" } }
  const peers = peerRangesOf([library, executable])
  assert.equal(peers.get("@effect/sql-sqlite-node"), "^4.0.4 4.0.4")
  assert.equal(peers.get("effect"), "^4.0.4")
})

test("an optional adapter declared only in peerDependenciesMeta is selected at any version", () => {
  // @smthrs/database names its SQL adapters this way; the smoke installs every
  // optional peer, and a consumer that selects one is held to the others' ranges.
  const library = { peerDependencies: { effect: "^4.0.4" },
    peerDependenciesMeta: { "@effect/sql-pg": { optional: true }, vitest: { optional: true } } }
  assert.deepEqual([...peerRangesOf([library])], [["effect", "^4.0.4"], ["@effect/sql-pg", "*"], ["vitest", "*"]])
  assert.deepEqual([...peerRangesOf([library], { optionalPeers: [] })], [["effect", "^4.0.4"]])
  assert.deepEqual([...peerRangesOf([library], { optionalPeers: ["@effect/sql-pg"] })], [["effect", "^4.0.4"], ["@effect/sql-pg", "*"]])
  const executable = { dependencies: { effect: "4.0.4" }, peerDependencies: { "@effect/sql-pg": "4.0.4" } }
  assert.equal(peerRangesOf([library, executable], { optionalPeers: [] }).get("@effect/sql-pg"), "* 4.0.4")
})
