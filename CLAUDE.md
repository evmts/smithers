---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Git Commit Protocol

ALWAYS commit changes after making them. Every change to the codebase must be committed.

After creating a commit, attach a git note containing the original user prompt that led to the changes:

```sh
git notes add -m "User prompt: <the exact user prompt>"
```

Example workflow:
1. Make changes to files
2. Stage and commit the changes with a descriptive message
3. Add a git note with the original prompt

```sh
git add .
git commit -m "Add feature X"
git notes add -m "User prompt: Add feature X to the application"
```

This creates a traceable history linking each commit to its originating request.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## React Hooks

Avoid using `useEffect` directly. Use the vendored hooks from `src/reconciler/hooks` instead:

```tsx
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'

// Instead of: useEffect(() => { ... }, [])
useMount(() => {
  // runs once on mount
})

// Instead of: useEffect(() => { return () => { ... } }, [])
useUnmount(() => {
  // runs on unmount, always uses latest callback (no stale closures)
})

// Instead of: let cancelled = false; return () => { cancelled = true }
const isMounted = useMountedState()
useMount(() => {
  fetchData().then(data => {
    if (isMounted()) setState(data)  // safe async state updates
  })
})
```

**When to use each:**
- `useMount` - code that runs once when component mounts
- `useUnmount` - cleanup code that needs the latest props/state (avoids stale closures)
- `useMountedState` - async operations that set state (prevents "setState on unmounted component")
- `useEffect` with deps array - only when you need to re-run on dependency changes (e.g., reactive queries, state watchers)

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
