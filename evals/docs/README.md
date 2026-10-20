# Docs page eval

One case per slug in `apps/app/src/docs/toc.ts`. Uses the product `Suite`, `CaseExecutor`, `Binding`, `Scorer` and `Rubric` APIs. Discovery recursively scans `<root>/evals/` in `packages/smithers/src/evaluation/Evaluation.ts`. The package keeps its entry at `evals/pages.eval.ts`, so `--root evals/docs` selects `pages`. Page content and images are read directly from `apps/app/src/docs`, never copied.

From the repository root, pin the source CLI (the Mac's PATH can select an unrelated Homebrew binary):

```sh
smthrs() { "$HOME/.nvm/versions/node/v26.5.0/bin/node" packages/smithers/bin/smithers.mjs "$@"; }
bun test evals/docs/checks.test.ts
node evals/docs/calibrate.ts
smthrs eval list --root evals/docs
smthrs eval run pages --root evals/docs --run-id docs-pages-next --output pages.next.run.json
smthrs eval baseline docs-pages-next --root evals/docs --output pages.baseline.json --force
smthrs eval compare docs-pages-next --root evals/docs --baseline pages.baseline.json
```

Use Node 26.4+ for the CLI and calibration. Baseline updates are deliberate review operations; ordinary regression checks run and compare without replacing the baseline. Run IDs and output files must be new. Runs are stored under `evals/docs/.flows/evals/runs/`, not `.smithers/`. Reusing an existing `--output` fails with EEXIST after scoring; the CLI currently hides that cause behind `eval_run_failed` unless `--verbose` is enabled. `pages.run.json` preserves this baseline's original observations and judge verdicts; compare it directly if the local run store is absent. A passing comparison means scores did not regress, not that all pages passed. A changed rubric or skipped-judge configuration changes scorer identity and requires a new, reviewed baseline.

## Scores and evidence

`images-resolve`, `steps-have-shots`, `anatomy` and `fresh-captures` are binary, naming their first failure. Frontmatter and fenced examples are excluded from prose checks. Task pages are identified by numbered `## N. ...` headings. Pages without those headings do not require task anatomy or step screenshots; the judge still assesses their UI instructions. `DOCS_EVAL_BUILD` overrides the online `https://smithers.sh/__build.json` `gitSha`; an unavailable build scores 1 with `build unknown`. Missing image files or manifest entries still fail resolution.

`journey` uses the trailing consecutive passing runs in the receipts array (chronological order). One valid pass scores 0.5; two or more score 1; the latest failure resets progress. Each counted run needs agent, date and receipt. `receipts.json` records two trailing passes for Local quickstart; other pages have no journey receipts and score zero. This suite does not execute reader journeys or validate receipt contents.

The Rubric uses four integer 1–5 criteria. Every criterion must reach 3 and the mean 3.8; `meta.pass` records that verdict. The reported scalar follows the standard Rubric normalization `(mean - 1) / 4`, rather than converting the verdict to a binary score. Per-criterion scores and verdicts remain in the run artifact.

The judge reuses `NodeControl.layerSeatEvaluator`: Jev when configured, otherwise Claude Code subscription first and Codex Luna next, through `EvaluatorBackup.fromModel`. No direct Haiku API-key calls. Choice questions preserve integer rubric scores; Jev score questions can interpolate fractional values. Only the Markdown field is graded; CLI help and capture records are supporting evidence. The current evaluator accepts JSON/text, so **no light images were attached**. Alt text and manifest entries establish textual coverage, not pixel-level correctness. The CLI help fixture was captured with `smthrs --help` (installed rc.13); it is not fabricated help.

If no subscription judge is reachable, use `DOCS_EVAL_SKIP_JUDGE='<specific failure>'`. That explicitly records zero with `meta.skipped=true`, rather than inventing a passing judgment. Retain the run artifact beside any such baseline; the baseline schema itself stores only scores and scorer identities, not skip metadata.

## Calibration

Measured agreement: **6/6 (100%)**, three good pages pass and three bad pages fail; see `calibration.json`. No judge was skipped. The fixtures are held-out inputs, not labelled anchors shown to the judge. Earlier calibration exposed nested string evidence being misread; the adapter now supplies the Markdown, capture entries and CLI help as structured fields.

Deterministic expected vectors, in order: image resolution, step shots, anatomy, freshness:

| Fixture | Expected vector | Judge label |
| --- | --- | --- |
| good-ui | 1, 1, 1, 1 | pass |
| good-terminal | 1, 1, 1, 1 | pass |
| good-reference | 1, 1, 1, 1 | pass |
| bad-no-shot | 1, 0, 1, 1 | fail |
| bad-button | 1, 1, 1, 1 | fail |
| bad-marketing | 1, 1, 1, 1 | fail |

These vectors are asserted exactly. The specified deterministic checks cannot distinguish a structurally valid invented button or marketing paragraph from good prose: those are deliberately judge-only failures. Requiring deterministic separation of all six would require additional semantic checks beyond the brief's four checks.

The committed baseline includes existing page failures and missing journey receipts. It is advisory, not a publication gate or proof that the docs match deployed pixels. The live calibration and reader journeys are separate evidence.

Baseline refreshed against the five current pages (run `docs-pages-20261020-journeys`, 2026-10-20). Scores are image resolution / step shots / anatomy / freshness / journey / normalized judge:

| Page | Scores |
| --- | --- |
| welcome | 1 / 1 / 1 / 0 / 0 / .8125 |
| quickstart | 1 / 1 / 1 / 0 / 0 / 1 |
| local-quickstart | 1 / 1 / 1 / 1 / 1 / .75 |
| self-host | 1 / 1 / 1 / 1 / 0 / .25 |
| flows | 1 / 1 / 1 / 1 / 0 / .4375 |

Compared with the previous baseline, Local quickstart's journey improved from 0 to 1 with two consecutive passing reader runs after two failures. Welcome and Quickstart freshness fell from 1 to 0 against the live build. Self-host's judge dropped from .5 to .25 (task completeness 5 to 1); the other judge scores are unchanged. The text-only judge reports plain words 2 for Welcome; build matching 1 for Local quickstart; task completeness, build matching and screenshot coverage 1 for Self-host; and build matching and screenshot coverage 1, plain words 4 for Flows. These are criterion scores, not prose diagnoses. No judge was skipped.

The offline targets depend on the app's `docsInputs` and `docsImages` filegroups for page and image globs, plus the TOC file explicitly. A temporary marketing-only Quickstart produced a rubric regression (compare exit 1); the page was restored without updating the baseline.
