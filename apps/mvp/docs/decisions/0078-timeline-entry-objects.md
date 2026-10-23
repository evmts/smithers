# Timeline entries name recorded objects

2026-10-23. Implements Will's 2026-10-22 request for useful branch timeline entries.

The existing first-party `chat.rail` contribution supplies a concrete `label` alongside the optional model `summary`. A matching specific summary wins; a missing, stale or generic summary uses recorded fields. Questions use their first eight words; replies join by `questionId`, never neighboring text. Runs name their recorded flow and outcome. TODOs name their title, PR or TODO number, and current outcome; a retained execution step cannot override a settled state. Missing question content uses the reply's identity, not invented content. Draft order matches transcript creation order. Public `onActivate` separates explicit entry activation from `onJump` scrolling, so keyboard traversal and grouped entries cannot navigate away.

The conversation and status projections expose existing question and flow identities. No stored schema changes or new event parsers are needed. The branch uses the existing TODO service and stored branch association. PR check results are not recorded on these rows, so the timeline makes no check-success claim.

A generated summary keeps visual precedence, while the button's accessible name also retains the recorded label when different. This preserves the question identity and reply outcome independently of model wording. Group names remain group names; `aria-controls` still links each individual entry to its transcript anchor.

Catalog entries: `@smthrs/ui` for `ChatTimeline`, `@smthrs/agent` and `@smthrs/model` for the existing durable summary step, and `@smthrs/journal` Redaction for recognized credential forms before clipping or displaying text (including cached summaries). The public UI component gains the optional label; the app contribution owns projection. Text stays in the private conversation and existing summary journal, never telemetry. Secret-service values and raw tool arguments are not entry sources.
