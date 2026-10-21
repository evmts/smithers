---
"@smthrs/sandbox": minor
---

Add `SandboxTools`: typed tools on a session's working copy (run a command, read, write and list files, git status and diff) with Schemas for every input and output, bounded output and timeouts, paths confined to the workdir, and a command fenced by its call id so it runs at most once. `checkpoint` and `restore` carry a working copy from one machine to the next as a commit and a binary patch.
