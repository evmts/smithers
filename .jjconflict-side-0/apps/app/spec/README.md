# Static spec build

From `apps/app`:

```sh
bun spec/validate.ts
pnpm exec vite build --configLoader runner --mode spec
pnpm exec playwright test --config playwright.spec.config.ts --workers=1
```

Serve `apps/app/dist-spec` with a static host that falls back to `index.html`.
Apply its `_headers` file (CSP on every response, including worker scripts).
The production build remains `pnpm exec vite build --configLoader runner`.

Open `/maya/tinyhttp`, `/smithers-canary/smithers`, or `/effeck/effeck`.
Choose `?as=out|member&data=full|empty&net=ok|slow|error`.
Bootstrap, identity, repository metadata, guest admission and bookmarks establish
the read target; net variants affect every content, home, issue and inventory read.
Slow reads take 750 ms. Error reads return 503 with a named fixture error.
The converter is off; no spec-only capabilities are advertised (`ahead` is empty).

Add a typed `route({ method, path, schema, handle })` in `routes/reads.ts`.
Schemas come from `@smthrs/rpc`; path parameters use `:name`, tails `*path`.
Extend `validate.ts` when a route needs more representative parameters.
Every response is decoded before delivery and by `specSite` before bundling.

`window.__spec` exposes `world`, `requests`, `sockets`, `failures`, `violations`,
and `assertClean()`. Unknown HTTP/socket requests produce a visible fixture
failure; `assertClean()` throws. Tests also refuse any backend request that
reaches the static server, including requests originating in workers.

Known product gaps are retained as failing tests, outside the D1 transport gate:
`SPEC_PRODUCT_GAPS=1 pnpm exec playwright test --config playwright.spec.config.ts --workers=1`.
They assert whole long files (L3/L4) and semantic README headings; the product
currently clips file cards at 16 KiB and draws homepage headings without roles.
