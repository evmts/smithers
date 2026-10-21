---
"@smthrs/sandbox": minor
"@smthrs/platform-cloudflare": minor
---

Says where a sandbox tool failed.

- `SandboxTools.ToolUnavailable` gains `exitCode`: the tool's script's own exit
  code when the script ran and failed (`code` `unknown`). `checkpoint` exits
  120 to 124 for its `mktemp`, `read-tree`, `add`, `diff` and `bundle` steps.
- `ContainerSession` logs the container's own failures as
  `cloudflare.container_session`, with the `operation` (`exec`, `stdout`,
  `stderr`, `exit`) and the failure's tag, never its text.
