# Third-party notices

This distribution contains third-party software. The notice below is
reproduced to satisfy the terms of the license that component is distributed
under. It is in addition to, and does not replace, the project's own `LICENSE`.

## Effect (`Effect-TS/effect`)

`@smthrs/plan` prints a schema's identity with an adapted copy of the JSON
Schema emitter of one Effect release, so that the identity does not change
with the Effect release an application installs. `src/internal/SchemaIdentity.ts`
contains substantial portions of that source and records how it was changed:

- Upstream repository: `Effect-TS/effect`
- Upstream package: `effect@4.0.0-rc.115`
- Upstream sources: `src/internal/schema/toJsonSchemaDocument.ts`,
  `src/JsonSchema.ts` (`rewriteRefs`), `src/JsonPointer.ts`, and
  `src/SchemaAST.ts` (`isJson`)

Effect is distributed under the MIT License. Its copyright and permission
notice is reproduced here verbatim:

```
MIT License

Copyright (c) 2023 Effectful Technologies Inc

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`@smthrs/plan` also depends on Effect at runtime, so the notice above applies
to that dependency as well as to the adapted source.
