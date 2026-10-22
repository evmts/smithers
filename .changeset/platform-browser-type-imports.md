---
"@smthrs/platform-browser": patch
---

Type `authorize`'s database parameter in BrowserRuntime.ts and internal/Engine.ts with a top-level `import type` instead of an `import()` type, so the package's lint passes, with no change in behavior.
