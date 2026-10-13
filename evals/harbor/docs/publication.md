---
title: "Benchmark publication"
description: "Publish a paired Smithers and baseline run only when it is complete, sealed and measured."
---

```bash
python3 -B evals/harbor/report.py <smithers-job> <baseline-job> <out-dir>
```

The first job runs `SmithersAgent`; the second runs the baseline, such as
`PooledCodex`. The command writes `report.md` and `report.json` to
`<out-dir>`, exits `0` when the run is publishable, and exits `3` with every
reason when it is not. A refused report has no pass rates.

A publishable run meets every rule:

| Rule     | Requirement                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| Same run | One dataset, model, environment and attempt count; every trial ran them; no timeout overrides   |
| Finished | Every planned trial retained; none running or infrastructure                                    |
| Paired   | Each task has one checksum and exactly the planned scored attempts in both arms                 |
| Size     | At least 50 paired tasks (`--min-tasks`); unplaceable tasks leave both arms and are listed      |
| Measured | Every scored trial reports input, cached and output tokens                                      |
| Sealed   | No extra allowed hosts or mounts; a command exited 0 in the task container; host audit clean    |

The journal keeps a digest in place of a call input too large to keep, which
hides the call's container. The host audit lists such a call with
`target: unknown`, the trial stays unsealed, and the refusal says the input was
truncated.

The pass rate is the mean verifier reward over every scored trial of the
paired tasks. `report.json` names each trial and its `agent/trajectory.json`.

Both files also say where each arm's time and tokens went, for every paired
task and overall: model calls, seconds per call, cache share, the wall clock
split into model wait, commands, judge, compaction and the rest, tokens by
purpose, and the fit of call seconds on thinking and written tokens. In
`report.json` this is `comparison`. It is read from each scored trial's own
record and changes no score; a refused report carries it too. The
[adapter README](../README.md#where-time-and-tokens-went) defines each number.

Run [benchmark health](health.md) while a job runs. The full paired
Terminal-Bench 4.0 run is tracked in
[#1917](https://github.com/smithersai/smithers/issues/1917) and publication
in [#1846](https://github.com/smithersai/smithers/issues/1846).
