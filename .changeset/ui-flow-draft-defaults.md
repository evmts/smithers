---
"@smthrs/ui": minor
---

`FlowDraftView` lets a person accept a blocking question's default, and offers Draft again and Delete.

- `answersToSend(questions, answers)` is what Answer sends: each changed answer, and each blocking question nobody
  answered at the value its field shows, its assumed default until the person types. An empty field sends nothing.
- `Answer` is on while `answersToSend` has something to send, so `Needs you` with a usable default no longer holds the
  draft until the person retypes it.
- `onRetry` shows `Draft again` and `onDelete` shows `Delete`; each is hidden without its handler.
- `failure` is shown as given: pass the words for why the draft failed.
