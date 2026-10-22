import type { PutApiInstallBody } from "../../src/internal/backend/ProductApi.ts"

const valid: Array<PutApiInstallBody> = [
  { parallel: 1 },
  { parallel: 8, capacity: 2, chatgpt: true },
  { capacity: 2, chatgpt: false },
  { bind: "192.0.2.1:4000", origins: ["https://example.com"] },
  { origins: ["https://example.com"] },
  { "wiki_sync.obsidian": { path: "/notes" } }
]
// @ts-expect-error a settings request must contain a setting
const empty: PutApiInstallBody = {}
// @ts-expect-error parallel is numeric
const wrongType: PutApiInstallBody = { parallel: "many" }
// @ts-expect-error parallel is at least one
const belowMinimum: PutApiInstallBody = { parallel: 0 }
// @ts-expect-error parallel is at most eight
const aboveMaximum: PutApiInstallBody = { parallel: 9 }
// @ts-expect-error unknown settings must be rejected
const unknownSetting: PutApiInstallBody = { typo: true }
// @ts-expect-error the wiki path is required
const missingPath: PutApiInstallBody = { "wiki_sync.obsidian": {} }
// @ts-expect-error network and capacity changes are mutually exclusive
const mixed: PutApiInstallBody = { bind: "192.0.2.1", capacity: 1 }
// @ts-expect-error wiki and capacity changes are mutually exclusive
const mixedWiki: PutApiInstallBody = { "wiki_sync.obsidian": { path: "/notes" }, parallel: 2 }
void [valid, empty, wrongType, belowMinimum, aboveMaximum, unknownSetting, missingPath, mixed, mixedWiki]
