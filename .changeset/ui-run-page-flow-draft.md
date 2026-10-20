---
"@smthrs/ui": minor
---

Adds the run page and the flow-draft card (apps/mvp decision 0014):

- `JsonValue`: a value the host already redacted and clipped, as text in a disclosure with its size and a `Clipped`
  marker; pretty-printed when it is whole JSON. `jsonValueText` and `formatBytes` are its helpers.
- `RunHeader`, `RunList`, `RunStatusPill`, `SpanTree`, `SpanDetail`, `RunWaterfall` and `RunJournal`: a run's line with
  its state in a live region, a table of runs, its steps as a keyboard listbox, one step's attempts, wait, input and
  output, its timeline, and its journal. `runWord` and `RUN_WORDS` are the closed vocabulary (`Queued`, `Working`,
  `Waiting`, `Stopping`, `Stopped`, `Failed`, `Done`, `On another device`, `Expired`, `No access`); `waterfallBars`,
  `clockDuration`, `stepDuration` and `untilWords` are the pure helpers. Every component takes `now` instead of
  reading the clock.
- `FlowDraftView`: the card a flow is drafted in: the form before the first round, then the round's status, its
  questions with the default each assumed, the drafted files, the static checks, and `Draft`, `Answer`, `Try`, `Save`
  and `Propose`, each shown only with its handler.
