---
"@smthrs/ui": minor
---

Adds issue triage for apps/mvp decision 0012 §5:

- `IssuesView` rows take `triage` (`proposed`, `accepted`, `not_accepted` or `conflict`) and show a `Proposed`,
  `Accepted`, `Not accepted` or `Conflict` chip after the number. Rows without it are unchanged. `IssuesViewTriage` and
  `TRIAGE_WORDS` are on the root.
- `TriageControl`: a `Triage` group with the state chip, an optional `Requested` or `Not sent` chip, and `Accept`,
  `Not accepted` and `Run triage again` buttons, each shown only when its handler is passed and the state allows it.
  `disabled` disables them.
- `ItemConversation` takes `headerActions`, rendered at the end of the header's meta row and not while `loading`.
- `triageControlCss`, part of `smithersUiCss`.
