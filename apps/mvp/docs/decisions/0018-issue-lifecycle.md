# 0018: Issue lifecycle

Status: proposed. Will, 2026-10-20 19:40; implementation brief 19:42.

Burn-down 23:04: only needs-repro, discussion wording and person-set commitments are in this landing. Sandbox verification, auto-POC, preview, budget, expiry, repository controls and POC-to-TODO context remain todo; no POC flow is registered or UI exposed. The following POC paragraphs describe the proposed follow-up.

Bugs need a minimal reproduction: a short repository snippet or failing test. Before judging a bug, triage checks its reproduction. Missing evidence adds `smithers:needs-repro` and one App comment asking for it, deduplicated across reruns. A candidate is evidence to verify, not proof: run it in a branch sandbox against a pinned `main` revision and retain the failing command, exit status and revision. An agent may draft a candidate; a person confirms it. Missing or unsuccessful verification never counts as verified.

`smithers:accepted` means **accepted for discussion**. It promises no implementation. Maintainers may set one commitment on an accepted issue: `smithers:commit-now` (being worked), `smithers:commit-next` (planned soon), `smithers:commit-later` (wanted, no date), or `smithers:commit-none` (open to contributors). GitHub labels are authoritative; conflicting labels show a conflict. Show a chip and an issues-list filter. Recheck Maintainer authority at every write; agents cannot manufacture a person's commitment.

A Maintainer can enable or disable auto-POC per repository. On acceptance, `issue/Prototype` starts one durable run for that acceptance, on `poc/<issue>`, never the stack. It builds a small, clearly marked prototype with existing sandbox tools, then publishes a playable sandbox preview. Libraries and languages use a runnable snippet and its actual output. Only a successful preview receipt permits the App's one comment linking the branch and preview; a failed launch never claims success. Replayed acceptance and retries adopt existing receipts. Recheck settings and authority before acting. The run pins its token budget and expiry; the durable clock reclaims the sandbox on expiry, including failure and cancellation. Preview access follows repository access and never exposes credentials.

A person's **Make TODO** reuses the issue-to-TODO flow, carrying the source issue and POC branch as context. The person commits that draft; only then does decision 0016's factory implement, review and open a PR. Acceptance, commitment and a POC never commit a TODO, approve or merge. This is the seam with 0016's simplified factory addendum.

All behavior is named `@smthrs/flow` flows and plugin contributions under decision 0017: triage guard, commitment action/filter/chip, repository setting, acceptance trigger and preview card. First-party code has no private plugin API. System authorization and publication remain non-overridable. Use catalog entries `@smthrs/flow`, `@smthrs/agent` (`ModelStep`), `@smthrs/integrations` (GitHub), `@smthrs/sandbox`, and `@smthrs/ui`; extend missing host capabilities upstream.

Build in three real-GitHub slices: needs-repro; commitment; auto-POC and preview. Each needs behavioral coverage, a scratch-repository e2e and GIF. No slice is declared working from unit tests alone.
