---
"@smthrs/effect-electric": minor
---

`ShapeProxy.Shape` takes `columns`, the only columns Electric sends for the
shape, forwarded as Electric's `columns` parameter after `where` and `params`.
List every column a browser may see, the primary key included, to keep the rest
on the server; a column added to the table later stays there until the host
lists it. A browser's own `columns` is still dropped.

```ts
ShapeProxy.make({
  ...connection,
  shape: { table: "messages", columns: ["id", "role", "text", "status"] }
})
```
