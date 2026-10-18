---
title: GitRemote reads non-ASCII branch names (review 2, finding 3)
status: done
area: sdk
owner: GitRemote fix agent (started by 23:12 on 2026-10-19, test first; reported done 23:27)
updated: 2026-10-19
links: [code-reviews.md, repo-clone-and-view.md, ../decisions/0006-repo-clone-and-view.md, web-standard-globals-rule.md, integrations-browser-safe-root.md]
---

## What

Make `GitRemote` in `@smthrs/effect-code-storage` frame Git pkt-lines by bytes, so a repository whose default branch has non-ASCII characters, such as `日本語`, opens like any other.
- Frame packets on `Uint8Array` byte offsets, then decode each complete payload.
- The test helper counts encoded bytes, not `line.length`.
- Tests cover Unicode branch names across split network chunks.

## Why

[Codex checkpoint review 2](code-reviews.md), P2 finding 3. A pkt-line's length counts bytes, but `GitRemote.ts:106` and `:115` decode the whole buffer first and apply those lengths to JavaScript strings. Codex ran the real `GitRemote.head` with an injected HTTP client: `main` succeeded, and `日本語` returned `GitRemoteError { code: "invalid_response", status: 200 }`.

`repo/Inspect`, the first step of `repo/Clone` ([decision 0006](../decisions/0006-repo-clone-and-view.md)), reads HEAD through `GitRemote.head`, so such a repository would fail to import.

## State

- 23:01 on 2026-10-19: found by Codex review 2 and reproduced.
- By 23:12: the lead assigned it to a new agent, test first.
- 23:14: `packages/effect-code-storage/test/GitRemote.test.ts` changed, the agent's first write. `src/GitRemote.ts` is unchanged since 21:15.

- 23:15: **the fix is on disk**, unreported; nothing changed after 23:16:
  - `src/GitRemote.ts` (23:15) frames packets as `Uint8Array` subarrays and decodes each payload with a strict `TextDecoder` (`fatal: true`), so a payload that isn't UTF-8 is `invalid_response`.
  - `test/GitRemote.test.ts` (23:15) adds "Unicode branch names frame by bytes, however the network cuts the advertisement" over `日本語`, `feature/🚀`, combining marks and non-breaking spaces, and the helper counts encoded bytes (`TextEncoder`).
  - `CHANGELOG.md` and `docs/api.md` updated (23:15).
  - Status stays in progress until the report shows the test failing on the old reader and the package at 100% coverage.

- 23:27: **done, reported.**
  - Pkt-lines are framed on bytes, and each payload decodes with a fatal UTF-8 decoder, so a payload that isn't UTF-8 is `invalid_response`, never garbled text.
  - The new tests caught a second bug: the branch regex cut names that contain an ideographic space (U+3000) or a non-breaking space (NBSP). That is fixed too.
  - 49 tests pass at 100% coverage.
  - The lead told Will: "The git reader now handles branch names like `日本語` and emoji, and it rejects invalid text with an error."

## Next

Nothing. When R3 lands, `repo/Inspect` reads HEAD of a repository whose default branch isn't ASCII like any other ([repo clone and view](repo-clone-and-view.md)).

Until 23:27 the next step was: the agent's report: the Unicode test failing on the old reader, the byte-offset fix in `GitRemote.ts`, and the package back at 100% coverage.

## Questions for Will

None.
