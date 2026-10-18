# SWE-bench Verified scorecard

Instances: 5 · flows resolved **1/5** · codex resolved **5/5** · flows wins **0** · codex wins 4 · both pass 1 · both fail 0

## Preconditions: the subject this wave measured

| | |
| --- | --- |
| subject | `sha256:0000000000000000000000000000000000000000000000000000000000000000` |
| agreement | one subject, pinned and stamped by every instance |
| git HEAD | 0000000000000000000000000000000000000000 the recorded 2026-08-19 wave |
| `packages/harness/src/CellTurn.ts` | `sha256:1111111111111111111111111111111111111111111111111111111111111111` |
| loaded from | packages/harness/src/CellTurn.ts |
| `packages/cli/dist/esm` | `sha256:2222222222222222222222222222222222222222222222222222222222222222` (11 modules) |
| `packages/cli/src` | `sha256:3333333333333333333333333333333333333333333333333333333333333333` (11 files, built above) |
| node | v24.0.0 fixture |

Every `@smthrs/*` package except `@smthrs/cli` is loaded from its `src` directory, because that is where its workspace `exports` map points; the harness under test is the working tree, not a build. `packages/smithers/agent/harness/dist` is not in the loaded graph and its state means nothing here.

## Quality

| Instance | flows | codex | Bucket | Patch bytes | Edits ok/tried |
| --- | --- | --- | --- | --- | --- |
| astropy__astropy-8707 | empty patch | resolved | codex win | 0 | 0/0 |
| django__django-16612 | resolved | resolved | both pass | 643 | 0/1 |
| pydata__xarray-7393 | empty patch | resolved | codex win | 0 | 0/0 |
| pytest-dev__pytest-6197 | unresolved | resolved | codex win | 386 | 1/1 |
| sphinx-doc__sphinx-11445 | unresolved | resolved | codex win | 2,373 | 1/1 |

## Speed

| Instance | flows wall clock | codex wall clock | Turns | Model calls | Mean call latency |
| --- | --- | --- | --- | --- | --- |
| astropy__astropy-8707 | 430s | 101s | 45 | 45 | 4022 ms |
| django__django-16612 | 644s | 82s | 37 | 37 | 4018 ms |
| pydata__xarray-7393 | 1,505s | 81s | 95 | 95 | 4047 ms |
| pytest-dev__pytest-6197 | 690s | 183s | 68 | 68 | 4034 ms |
| sphinx-doc__sphinx-11445 | 527s | 82s | 46 | 46 | 4023 ms |

Totals: flows 3796s · codex 529s.
Per-call latency is journaled for this wave.

## Cost

| Instance | Input | Cached | Output | flows USD | Jev tokens | Jev USD | flows total | codex tokens | codex USD (floor) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| astropy__astropy-8707 | 211,519 | 0 | 12,455 | $1.0952 | 1,500 | $0.0001 | $1.0953 | 37,867 | $0.1515 |
| django__django-16612 | 143,056 | 0 | 10,506 | $0.7823 | 1,500 | $0.0001 | $0.7824 | 30,840 | $0.1234 |
| pydata__xarray-7393 | 356,978 | 0 | 20,687 | $3.4764 | 1,500 | $0.0001 | $3.4765 | 34,894 | $0.1396 |
| pytest-dev__pytest-6197 | 277,964 | 0 | 16,190 | $2.7094 | 1,500 | $0.0001 | $2.7095 | 64,398 | $0.2576 |
| sphinx-doc__sphinx-11445 | 181,556 | 0 | 12,772 | $0.9817 | 1,500 | $0.0001 | $0.9818 | 27,988 | $0.1120 |

Totals: flows $9.0450 model + $0.0005 Jev (10 readings) = $9.0455 · codex $0.7841 (floor).

Prices come from the committed table in `prices.ts`. `flows USD` is the seat's model turns; `Jev USD` is every reading the run took of Jev (the completion brake, the per-frame supervisor, the agent's own `jev` calls and the gates), priced under the `typesafe-ai/jev` row, and `flows total` is both. The codex arm asks Jev nothing. The codex figure is a floor: the committed baseline records one total token count per instance, with no input/output split, so it is priced entirely at the input rate.

## Jev

| Instance | Cell calls | Cell questions | Questions unknown | Brake | Supervisor | Gates | Cells with Jev | Unjudged |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| astropy__astropy-8707 | 0 | 0 | 0 | 1 | 1 | 0 | 0/0 | 1 |
| django__django-16612 | 0 | 0 | 0 | 1 | 1 | 0 | 0/0 | 1 |
| pydata__xarray-7393 | 0 | 0 | 0 | 1 | 1 | 0 | 0/0 | 1 |
| pytest-dev__pytest-6197 | 0 | 0 | 0 | 1 | 1 | 0 | 0/0 | 1 |
| sphinx-doc__sphinx-11445 | 0 | 0 | 0 | 1 | 1 | 0 | 0/0 | 1 |

## Gates

| Instance | Withheld | Restored | Monitors delivered | Memory delivered | Compaction removed |
| --- | --- | --- | --- | --- | --- |
| astropy__astropy-8707 | 0 | 0 | 0 | 0 | 0 |
| django__django-16612 | 0 | 0 | 0 | 0 | 0 |
| pydata__xarray-7393 | 0 | 0 | 0 | 0 | 0 |
| pytest-dev__pytest-6197 | 0 | 0 | 0 | 0 | 0 |
| sphinx-doc__sphinx-11445 | 0 | 0 | 0 | 0 | 0 |
