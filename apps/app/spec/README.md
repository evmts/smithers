# Static spec build

From `apps/app`:

```sh
bun spec/validate.ts
pnpm exec vite build --configLoader runner --mode spec
pnpm exec playwright test --config playwright.spec.config.ts --workers=1
```

Serve `apps/app/dist-spec` with any static host that falls back to `index.html`.
The production build remains `pnpm exec vite build --configLoader runner`.

Open `/maya/tinyhttp`, `/smithers-canary/smithers`, or `/effeck/effeck`.
Choose `?as=out|member&data=full|empty&net=ok|slow|error`.
Bootstrap and identity establish the world; net variants affect every data read.
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
