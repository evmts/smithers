---
title: "Render live queries in a framework"
description: "Read a collection's or live query's tanstack field with @tanstack/react-db or another binding, and keep every write in the Effect program."
---

A view layer renders data; it doesn't own it. Keep reads and writes in the
Effect program, and hand the view the TanStack DB collections it renders and
plain functions it calls.

## What the view gets

Every `Collection` and `LiveQuery` has a `tanstack` field: the TanStack DB
collection itself. A binding such as `@tanstack/react-db` subscribes to it:

```tsx
import { useLiveQuery } from "@tanstack/react-db"

// The program made `openTodos` with LiveQuery.make, and hands the view `openTodos.tanstack` as `open`.
export function OpenTodos({ open }: { readonly open: typeof openTodos.tanstack }) {
  const { data } = useLiveQuery(open)
  return <ul>{data.map((todo) => <li key={todo.id}>{todo.title}</li>)}</ul>
}
```

## Why only there

`tanstack` is the one door to the raw TanStack DB API, and it has two uses: a
framework binding, and `from` in another live query. Read and write through the
Effects instead:

- a mutation called on `tanstack` throws instead of failing with
  `MutationRefused`;
- a read on `tanstack` is not an Effect, so it doesn't compose, trace or test
  like the rest of the program.

A view that needs to act calls a plain function the program bound for it, for
example with `Effect.runSyncWith(context)` over a context captured when the
program built the view. The view then never sees an `Effect`.

## Starting a query

A live query starts on its first read, `preload` or stream. A binding's hook
starts it on first render. A test that reads `tanstack.toArray` without a
binding calls `preload` first.
