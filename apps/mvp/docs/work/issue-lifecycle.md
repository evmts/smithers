---
title: Issue lifecycle — reproduction, commitment and playable POCs
status: in-progress
area: app
owner: Codex issue-lifecycle builder
updated: 2026-10-20
links: [../decisions/0018-issue-lifecycle.md, issue-triage.md, issues-to-todos.md, vibelang-coding-factory.md]
---

Will's 19:40 request and lead's 19:42 brief. Implement three vertical slices in the shared checkout without commits. Existing triage and issue-to-TODO work retain their owners. The POC hands a draft to Make TODO; it never starts the factory or commits the draft. Design is proposed; no implementation or passing e2e receipt yet.


Implementation update: missing-repro gate and commitment write/UI/filter are present; migration 0032 and UI wording changeset are written. Nine targeted tests pass and lifecycle policy coverage is 100%. Mini typecheck found shared-checkout errors plus an optional commitment-row typing error, now corrected by requiring the migrated column with item persistence version 3. Wider mini tests and SDK UI tests are queued. The isolated live instance was absent; up.sh created/migrated smithers_live and started :1339. Its browser run is waiting for the shared heavy lock. Sandbox verification and auto-POC remain unbuilt; no feature completion or live/GIF claim.
