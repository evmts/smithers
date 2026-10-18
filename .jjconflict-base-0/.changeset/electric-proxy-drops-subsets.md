---
"@smthrs/effect-electric": minor
---

Breaking: `ShapeProxy` no longer serves subset requests. The `subset` option
and the `SubsetPolicy` model are removed, and a browser's `subset__*`
parameters are dropped like every other parameter outside the Electric
client's protocol, never forwarded. A browser reads the whole shape;
`ElectricCollection` syncs whole shapes and sends no subset requests. The
proxy no longer answers 400 `Invalid subset request`, and its log line and
span no longer carry `subset`, `refused`, `electric.shape.subset` or
`electric.shape.refused`.

```ts
// Before
ShapeProxy.make({ ...connection, shape: { table: "items" }, subset: { columns: ["position"], maxLimit: 100 } })
// After
ShapeProxy.make({ ...connection, shape: { table: "items" } })
```
