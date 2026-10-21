---
"@smthrs/ui": minor
---

Adds `AvatarStack` and `ShareDialog` for branch sharing, after Google Docs and Figma.

- `AvatarStack`: overlapping initial avatars named by each person, with a tooltip of their `title`, a color fixed by
  their id, and one focusable `+N` whose tooltip names the rest past `max` (4). With `onSelect` each avatar is a button
  that follows its person on click, Enter or Space. No people renders nothing.
- `ShareDialog`: a controlled dialog with an `Add people` row (`Can view` or `Can edit`, `Share` or Enter), an error
  alert, `People with access` rows (`Owner`, or an access select and `Remove`, disabled while `pending`), `General
  access` (`Restricted` or the group, then a `Link access` select), `Copy link` and `Done`.
- Avatars paint with the host's `--lane-0` to `--lane-5` and `--avatar-ink` when it defines them, else the theme's own
  hues, in light and dark. `avatarStackCss` and `shareDialogCss` are part of `smithersUiCss`.
