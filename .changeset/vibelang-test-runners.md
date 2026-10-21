---
"@smthrs/targets": patch
---

Test targets are keyed on VibeLang `.vibe` modules: `BunSuite` keys its run on
`test/**/*.test.{ts,vibe}` and `src/**/*.{ts,vibe}` by default, and
`FaultSuite` on `test/faults/**/*.test.{ts,vibe}`, its fixtures, and
`src/**/*.{ts,vibe}`.
