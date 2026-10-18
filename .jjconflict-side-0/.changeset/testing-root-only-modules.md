---
"@smthrs/testing": major
---

`CachedEvaluator`, `TurnGate`, `ScriptedModel` and `BuiltinScript` are on the
`@smthrs/testing` root only. Their subpaths are gone, because consumers import a
package from its root entry:

```ts
// Before
import * as BuiltinScript from "@smthrs/testing/BuiltinScript"
// After
import { BuiltinScript } from "@smthrs/testing"
```

The Node-only modules keep their subpaths: `ModelServer`, `ModelServerCli`,
`TurnLog`, `ProcessTable`, `Faults`, `TestHost` and `Vitest`.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
