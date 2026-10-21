---
"@smthrs/ui": minor
---

Other people's carets in a field everyone edits at once.

- `CollaboratorCarets` draws each `Collaborator`'s caret and selection over a `<textarea>` or `<input>`, in the color
  `AvatarStack` gives them, flagged with their name; `useSharedSelection` keeps a controlled field's caret where the
  person left it when its value changes from outside; `selectionOf` reads a field's selection with its direction.
- `ChatComposer` and `NeedsYouCard` take `collaborators`, `selection` and `onSelectionChange`, and `onValueChange` now
  also receives the selection after the change. `ChatComposer` takes `readOnly`: the draft and carets show, without
  Send.
- Exports `personLane` and `PERSON_LANES`, so another package colors a person alike.
