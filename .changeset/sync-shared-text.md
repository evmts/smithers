---
"@smthrs/sync": minor
---

Adds `SharedText`: a text several people edit at once, one Yjs document wrapped in Effect.

- `make` opens a replica. `edit` and `replace` change it and answer the update to send; `apply` merges another
  replica's update in any order, and an update applied twice changes nothing. `replace(next, { caret, base })` places an
  ambiguous insertion at the caret, and moves an edit made on an older text (`base`) past what arrived since, so it
  never undoes it.
- `anchor` and `resolve` carry a caret between replicas through everyone's edits.
- `seed(text)` is a document's first content, the same bytes for the same text; `validate` refuses malformed bytes and
  text forged as the seed's replica; `merge` joins several updates into one.
- Adds `yjs` 13.6.32, already a workspace dependency, as a dependency.
