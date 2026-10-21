---
"@smthrs/cli": patch
---

A flow that can't be loaded names the system call and path that failed after the
reason, such as "Operation not permitted (os error 1); open /repo/bun.lock in
AtomicFileSystem.readFile", instead of the reason alone.
