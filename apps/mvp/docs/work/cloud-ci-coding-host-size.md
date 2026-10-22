---
title: Restore the Cloud CI coding host size gate
status: done
area: infra
owner: Codex SOLC-cloud-sh
updated: 2026-10-21
links: [../../../../../.github/scripts/ci/cloud.sh, ../../../../../.github/scripts/ci/cloud.test.ts]
---

The Cloud runner contract reports the required `codingHostSize` CI command
missing from `.github/scripts/ci/cloud.sh`.

The runner last changed in `7df5f685fc84` (October 16). The size check was
added later, in `f717e19cd4b8` (October 18), and mirrored in the release
inventory by `084d6c7febbd`. It was never added to the runner; today's legacy
removal did not remove it. Main still declares the target and requires it
in CI and release. Restore the runner mapping without exempting the check.

No library or public API change is needed; this maps an existing target.

Restored `flows-coding-host-size` with the JavaScript toolchain and the exact
required CI command, and documented it in the coding host's deployment docs.
The existing contract is unchanged: before the fix,
`bun test ./.github/scripts/ci/cloud.test.ts` reported 41 pass / 1 fail,
naming the missing `codingHostSize` command; after the fix it reports
42 pass / 0 fail (823 assertions). `bash -n .github/scripts/ci/cloud.sh`
also passes. The packaged host build itself was not rerun.
