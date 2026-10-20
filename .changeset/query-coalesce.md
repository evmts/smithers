---
"@smthrs/effect-tanstack-db": minor
---

`Query` re-exports TanStack DB's `coalesce`: the first of its arguments that
isn't null. Given a last argument that is never null, its result is typed never
null, so a live query can select a nullable column beside other rows in
`unionAll` (the MVP app's issues list, decision 0012).
