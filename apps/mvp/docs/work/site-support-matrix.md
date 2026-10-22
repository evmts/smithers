---
title: Correct the site's support matrix after legacy removal
status: done
area: docs
owner: Codex site-support-matrix
updated: 2026-10-21
links: [../../../site/scripts/support-matrix.test.mjs, ../../../site/docs/reference/support-matrix.md]
---

Find the failing support reference assertion after legacy code removal and docs
moves. Correct the owning source without weakening the test, then verify the
site suite and `pnpm docs:check`. Delivery is a local commit and bookmark, per
the SOLC-site-support-matrix brief; no push.

The unchanged support test reproduces `50 !== 51` in the published Node engine
inventory. The release roster explicitly includes `@smthrs/views`, and its
public manifest at `packages/smithers/ui/views/package.json` declares
`engines.node: ">=26.4.0"`. It is the only missing row; no extra package is
documented. The release data is correct, so add the row to the matrix source.
No test, release roster, public API, or generated page needs changing:
`sync-support-docs.mjs` does not project the retired matrix page.

Library catalog entry: `@smithers/site` (documentation only; no library added).

Verification: the unchanged support test passes 7/7; all 51 inventory
rows match their manifest engine and path; `pnpm --filter @smithers/site test`
passes 114/114. The additional `check:docs` command passes 100/100 tests, then
reports an existing missing workspace-private label for `@smthrs/model-host`
in the generated platform-node API page. `pnpm docs:check` passes with exit 0,
51 published package tarballs passed, and durable `run-1` status `completed`.
Its initial attempt refused to run without the native filesystem helper;
`cargo build --locked --release -p smithers-ffi --bin smithers-jj-export`
built the documented helper locally before the successful rerun. The same
redirect-map and tarball modules also pass directly. No application code,
test, public API, or threshold changed; executable coverage is unchanged.
