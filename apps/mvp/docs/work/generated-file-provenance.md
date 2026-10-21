---
title: Generated files link to their source and generating flow
status: todo
area: app
owner: unassigned (built by the repo-browse slice; the e2e is left)
updated: 2026-10-20
links: [repo-view-branches-raw-clone.md, vibelang-generated-docs.md, ../rulings.md]
---

**What:** Show generated files with a small Generated chip and links to source, generating flow and last run.

**Why:** Will’s 19:35 queue answer says cached generated output should be identifiable and inspectable.

**Current state (22:05):** Built in the repository view ([repo.md](../features/repo.md#generated-files)): `@smthrs/ui`'s `GeneratedChip` in a file's toolbar links the flow's source, its last run and its inputs, from the manifest nearest the file (`.smithers/generated.json`, as `docs/generate` writes it) or a header marker; the branch editor warns over a generated file. Unit tests cover the manifest, the markers, the nearest manifest and the links.

**Next step:** an e2e on a small public repository that carries a manifest or a header marker; none of the repositories the specs clone has one.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, approximately 17:44–19:44 PDT; queue answers through 19:38 PDT; rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are lead-reported; tracker validation is the site build. Existing execution ownership is preserved.
