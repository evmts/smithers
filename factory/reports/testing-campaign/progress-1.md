First unit-testing wave, local evidence on the working tree based on `60f00de5dc` (not landed/Cloud-qualified):

- Flow: 676 tests passing; 100% statements/branches/functions/lines, independently rerun under Node 26.5.0. Added retry classification cross-product: 3 error tags × 3 attempt bounds × 3 elapsed bounds, plus retryable controls.
- Canonical: 262 tests passing; 100% statements/branches/functions/lines, independently rerun under Node 26.5.0. Added exact encoded-byte admission/refusal and detached/frozen container ordering invariants.
- Admission: combined real-PostgreSQL suite rose 66.7% → 100% statement coverage. Review requested that pure construction validation run independently without PostgreSQL; ongoing.
- App repository setup: initial addition passed 80 cases/748 assertions, with 90.96% controller line coverage. Continuing gaps; app-wide typecheck has existing unrelated conflicts, so not qualified.
- Credits: expanded archive validation exposed #2292. Astra implemented shared validation and neighboring-boundary PostgreSQL replay/readback. Full real-PostgreSQL suite passed (46.471s), `go vet` passed. `claude -p --model fable` (resolved `claude-fable-5-1`) reviewed it: no blocking issues; duplicate-test cleanup and clearer fixture applied. Separate total-overflow bug #2295 is now with Astra.

Broad package baseline runs sequentially with package-local Vitest under Node 26.5.0. Initial root-level Vitest attempt resolved a different runner instance; those diagnostic failures were discarded and rerun through each package's own runner. Current measured samples: std 94.55/88/91.9/96.1 (statement/branch/function/line), memory 99.11/95.47/98.37/99 (function threshold fails). This is combined-package evidence, not an independently qualified unit or integration tier.

Existing TUI harness/docs edits belong to concurrent work and are untouched. No thresholds lowered or production coverage excluded. Later integration/E2E/fuzz/benchmark phases remain pending. No claim of Cloud checks, merge, or wiki publication.
