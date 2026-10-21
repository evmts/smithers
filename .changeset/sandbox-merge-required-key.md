---
"@smthrs/sandbox": major
---

`SandboxMerge.apply` requires `key`. The change id no longer falls back to one derived from the work's session, base
and patch: that folded two applications of the same patch into one change, and landed a retry whose patch had changed
as a second change. Take the key from the step that applies, such as `Action.effectKey("apply")` from `@smthrs/flow`,
or an id recorded before the work ran. The durable `SandboxMerge.Apply` action already required one.

```ts
const outcome = yield* SandboxMerge.apply(work, {
  repository: "/srv/repo",
  onto: "main",
  message: "Fix #42",
  key: yield* Action.effectKey("apply")
})
```
