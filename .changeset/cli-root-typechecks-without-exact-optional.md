---
"@smthrs/cli": patch
---

The `@smthrs/cli` root typechecks in a program compiled without
`exactOptionalPropertyTypes`: `admin` builds an observed request's headers as a
`Record<string, string>`, where its inferred `{ "X-Confirm"?: undefined }`
branch was refused. A program that imports `NodeControl` from the root, such as
`apps/mvp`'s agent evals, no longer fails to compile on it.
