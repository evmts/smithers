Stage 3 fixture update: 23 JSON fields; 74 blobs, 129 tree entries, 89 runs, two eval suites.
Added evals.json; config.evals declares Golden set; index.ts exposes suites to the existing Evals views.
The 20 converter inputs and expected Effeck outputs are verbatim from the local convert/golden folders.
README.md, score.mjs and build-prompt.mjs match the current local converter source.
The source prompt includes the golden pairs. They are not held-out accuracy evidence.
Converter gate: 16 of 20 model outputs compile, hero included. Monday converter remains off.
Illustrative latest result: 14/20; hero passes; six compile failures explain the missing gate. All cases include expected source.
Docs suite: six pages compile in the illustrative result; this does not enable conversion.
Both suites link their mock runs; histories end at their latest score. These are not executed compiler receipts.
Added examples/users/src/main.effeck from the real example with fictional display names and illustrative type metadata.
Visible accounts use maya, cora, dev-ahn and smithers-agent. Human acceptance, review and landing remain human actions.
Factory: #31 → run-8fadacb5 → #101 → main commit 8fadacb51d. All four factory receipts resolve.
Validation: 12,565 fixture assertions; 699 symbols; 201 cross-file definitions; two diagnostic files.
Original commit hashes, ancestry, dates and diff history remain; added-source blame is illustrative.
Stage entry, exact screen IDs, shared-view requests and build evidence: ../../../views/hovers/REPORT.md and screens.json.
2026-10-18 vibe-rename: supersedes the source/provenance statements above; 74 complete blobs and 129 tree entries now match 4e26f6af.
Source docs and home blocks are verbatim at that revision; 8 historical/review paths resolve through aliases without duplicate blobs or changed screen URLs.
The pinned prompt uses separate examples; earlier illustrative holdout/validation records remain historical, and conversion stays off without a deployed model receipt.
Tracker issues, comments, commit messages/patches, pulls, runs, stack records, releases and tags remain byte-for-byte unchanged.
Run source-audit.mjs for exact pinned-source comparisons; check-fixtures.mjs validates 699 symbols and 201 cross-file definitions.
2026-10-19 public-repo exclusions: commits 903ba881c757, c9dbbb4d94ef and 9e22887b865b are left out, never rewritten, because their messages or patches quote private operations-vault paths, a personal workers.dev domain or a home-relative checkout path. All three sit mid-history; omittedCommits.json keeps only their real SHA and parents, so history walks through them, and tree and blame rows keep them as real last-touch commits. Their synthesized runs (run-903ba881, run-c9dbbb4d, run-9e22887b) are removed from runs.json and the flow run lists. `.smithers/flows/convert/README.md` is left out of files, tree and blame because it quotes a private operations-vault path; the Golden set wiki page drops its link to it. Now 78 commits, 73 complete blobs, 128 tree entries, 87 runs.
