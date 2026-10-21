---
"@smthrs/sandbox": minor
---

`SandboxTools.checkpoint` now carries commits no remote has, so a working copy
restored on a fresh clone keeps a commit made in the box.

- `Checkpoint` gains `bundle`: a git bundle of `HEAD --not --remotes`, empty
  when every commit is on a remote. The patch and bundle together count toward
  `limits.checkpointBytes`.
- `SandboxTools.restore` fetches a commit the working copy lacks from the
  bundle, else from `origin` by its id, before it moves `HEAD`; `not_found`
  when neither has it. A checkpoint without a `bundle` restores as before.
