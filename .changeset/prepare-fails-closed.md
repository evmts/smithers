---
"@smthrs/platform-browser": minor
---

A leader whose preparation of the app's shared database failed fences it
instead of serving it.

When `device/prepare` fails, the leader refuses every tab's statement, read or
write, with `@smthrs/platform-browser/PrepareFailed`, counted in
`BrowserRuntime.statements` as `outcome: "fenced"`. A tab's statement fails
with a `ConnectionError` whose `cause` names `PrepareFailed`, so
`SharedSqlite.open` rejects and an app falls back to memory. The failed run is
the epoch's answer, so every leader of that build keeps the fence; a build with
a new `epoch` prepares again.
