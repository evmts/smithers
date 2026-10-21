---
"@smthrs/views": minor
---

Adds `Home`, the reader of a repository's own home: the blocks `.smithers/home.json` declares (`text`, `links`,
`markdown`, `prompt`, `app`, `flows`, `stack`, `view`), each bounded and free of HTML.

- `Home.read(text)` never throws. It answers `{ _tag: "Declared", blocks, skipped }`, skipping and counting a block
  of a kind it doesn't know, or `{ _tag: "Invalid", reason }` (`json`, `shape`, `blocks` past 32, or `block` for a
  known kind that breaks its bounds).
- The block schemas and bounds are `@smthrs/targets`' own; `test/HomeTargets.test.ts` reads back every block the
  targets writer accepts and refuses what it refuses.
