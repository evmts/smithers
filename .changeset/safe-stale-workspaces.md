---
"@smthrs/jj": patch
---

Refuse stale and sibling working copies with a typed `stale_workspace` error naming the workspace and requiring deliberate recovery after committing or backing up files. Remove implicit `workspace update-stale` and disable jj's automatic stale update so tooling cannot discard uncommitted files during recovery.
