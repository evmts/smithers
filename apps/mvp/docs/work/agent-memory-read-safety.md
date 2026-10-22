---
title: Agent memory repository and wiki read safety
status: done
area: agent
owner: Codex mini memory fix
updated: 2026-10-21
links: [../../../../packages/smithers/agent/docs/guides/memory.md]
---

Reproduce and fix command UTF-8 isolation, repository containment and command-failure fallback, malformed catalog entries, large catalogs, and bounded page reads.

Uses the library catalog's filesystem/process entry: injected Effect FileSystem and ChildProcessSpawner, with Node services in tests. No new library or public API.

All six findings reproduced in seven failing cases before implementation:
separate malformed command streams combined into a euro sign, an outward
parent link exposed a file head, both repository markers allowed untracked
files after injected command failures, null catalog entries caused a defect,
an 800-page catalog disappeared, and a 32 KiB page read consumed 1,081,346 bytes.

Command decoders are isolated and flushed. File heads use canonical containment.
Failed listings never walk a repository (including ancestor markers and worktree
marker files); plain-directory walks remain supported. The refusal logs, traces
and counts a static event without paths or content. Catalog metadata is parsed
whole, independently of the 32 KiB page-body I/O budget; malformed entries are
skipped individually.

Validation: offline frozen install succeeded on Node 26.5.0. The final memory
suite run passed 88 tests across Memory.test.ts and MemoryReaders.test.ts.
Type checking, source lint, formatting and four direct import/call rules passed.
The package has no importRules target (the requested target returned unknown_label);
the repository's checker ran directly against the changed files instead.
End-to-end tests: not run (mini clone). Coverage was not measured by the focused runs.

The broader package run was interrupted after roughly ten minutes with one
worker still running and two reported failures. Both failing cases also failed
with the original repo.ts and wiki.ts restored: Fault.sweep.test.ts reports the
unregistered @smthrs/flow/EffectKeyUnavailable tag, and ModelStep.test.ts's
Retry-After case times out. The complete package suite is therefore not green;
these unrelated failures were not changed by this work.
