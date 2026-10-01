# Recorded calibration corpus

`real-corpus.json` contains all 110 pinned manifest entries, measured with the
canonical `recordRepository` static-analysis recorder. Repository code was read,
never executed. `real-fit.json` is the canonical fitter's output using the
zero-anchor correction in #3297. The synthetic artifacts remain separate and
unchanged. These fitted weights are not shipped in registration scoring.

The collection used five readers in bounded 15-minute campaigns, retaining each
validated complete row atomically before continuing. The recorder's Git command
limit remained 600 seconds. Failed and capped attempts were retained; successful
retries reused matching source/tool checkpoints. Campaigns 1–2 were
uninstrumented; campaigns 3–5 added an external diagnostic observer that preserved
command options, returns, callbacks and timeouts. The observer and exact campaign
provenance are in `evidence-2026-09-30/`, along with the immutable checkpoint and
original numerical failure. Local absolute paths in those original receipts are
historical identity metadata, not prerequisites for reproducing the corpus.

Reproduce with Node 26, Git, installed frozen workspace dependencies and network
access to the pinned public repositories:

```sh
node flows/register-repository/calibration/run-real.ts
pnpm exec smthrs test '//flows:calibrationReal'
```

The first command re-records the manifest and refits it. The maintained declared
test validates the full manifest/corpus/fit and independently re-records a
five-repository sample. Its existing unreachable-network skip remains explicit;
a skip is not evidence of successful reproduction.

Labels come from manifest selection evidence, not independent adjudication of
every line. The 110 repositories do not establish general detector accuracy.
Only deterministic S1–S5 were measured; unavailable signals remain null, and
coverage/band limitations remain in each row. Sparse strata borrow pooled p90
anchors. No Jev judgments or finding-level hand review were performed.
`precisionAtP90` counts repositories, not findings. AUROC and weights are fitted
observations, not model, performance, release, or self-hosting claims. Whole CI
and cross-platform evidence remain separate requirements.
