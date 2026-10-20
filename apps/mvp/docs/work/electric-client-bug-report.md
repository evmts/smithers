---
title: Electric client bug report (not filed)
status: blocked
area: sdk
owner: Will (decision)
updated: 2026-10-19
links: [../state.md, effect-tanstack-db-and-effect-electric.md]
---

## What

Two defects in `@electric-sql/client` 1.5.28, the latest:
1. It moves a live stream's offset to each subset snapshot's offset. With paging, sync can skip updates, which loses streamed answer text.
2. It never restarts a shape stopped by a response missing Electric's headers, such as a gateway error page. Only a page reload recovers.

## Why

The client agent found both while building `@smthrs/effect-electric`. We work around the first in that package, and document the second.

## State

- Workaround for (1) ships in the working copy as `keepOffset`: a comment naming 1.5.28, a version-pin test, and a reproduction confirmed to fail without the workaround. Listed in the package changelog.
- (2) is documented in the package; there is no workaround.
- Neither is reported upstream. Filing posts publicly on Electric's GitHub, so it needs Will's yes. Earlier the same day Will said: "Sotp sending bug reports never send bug reports only focus on this".

## Next

Nothing until Will answers. If yes: minimal reproductions against Electric 1.8.1, then delete the workaround when a fixed client ships.

## Questions for Will

- File the issues on Electric's GitHub? Default if unanswered: don't file.
