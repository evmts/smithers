---
"@smthrs/jj": minor
"@smthrs/sandbox": minor
---

Replace `retryGitIndexLock` with pure `isGitLockContention` classification. Sandbox commands now attempt once; `SandboxMerge.Apply` and `layerApply` delegate bounded contention retries to the durable engine, pinning a commit target and keeping custom strategies outside the retry boundary. Recover export after interrupted bookmark cleanup. Uses the catalog's jj, sandbox and flow libraries.
