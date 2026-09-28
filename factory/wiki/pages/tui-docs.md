# Executable terminal documentation

The TUI's user docs are authored for smithers.sh: the TUI tabs of the tutorials in `apps/site/src/content/docs/docs/learn/` and the TUI reference in `docs/tui/`. `apps/tui-docs` records the GIFs those pages show and builds the browser playground for tui.smithers.sh. Its Astro configuration maps former guide routes to smithers.sh. The recording scripts live in `apps/tui/docs/recordings/`, with the grammar in `apps/tui/docs/README.md`. The owning guide is `apps/tui-docs/README.md`.

## Recording scripts

A `tui-script` fence names a scenario and drives the production TUI in a private PTY. Model responses are deterministic fixtures, while cells, file changes, session writes, controls and checks execute for real. `Wait for answer` requires a saved successful answer; visible source text cannot satisfy it. A `browser-script` fence drives the real playground in Chromium with provider responses controlled at the HTTP boundary.

These recordings do not measure live model quality. The recorder captures terminal frames and encodes GIFs with FFmpeg into `public/recordings`; `pnpm --filter @smithers/site run capture:learn tui` copies the ones smithers.sh uses. A failed example fails the recording run.

`sync:reference` writes the Commands and Keys pages on smithers.sh from the TUI registries. The coverage test checks that those pages list every registered command and key, and that each recording marked `Production TUI` in the site's journey inventory has a script.

## Build graph

`//apps/tui-docs:build` depends on `:recordings`. Both are cached `ToolBuild` targets: recordings run `pnpm run record` into `public/recordings`, and the playground site runs `astro build` into `dist`. The package also declares `check`, `test` and `browserTests` targets. The recorder verifies cached artifact hashes and publishes a receipt only after assertions and encoding succeed.

Recording needs the pinned Node, Bun 1.4 or later, Python 3, Git, FFmpeg, Chromium and the native workspace helper for flow examples. `CHROME_BIN`, `FFMPEG`, `SMITHERS_DOCS_BUN` and `SMITHERS_WORKSPACE_JJ_EXPORT_BINARY` select installed tools. Recording inputs include the shipped native editor, so an editor update invalidates cached recordings.

## Browser playground

The playground runs `Agent.Agent` on `Flow.make`. Its only capabilities are `ls`, `read`, `write` and `check` over a bounded virtual volume. Each completed model response is persisted before its cell executes, and recovery replays committed responses and call results without executing completed operations again. Web Locks allow one writer across tabs. Serialized history is capped at 4,000,000 UTF-8 bytes; files are capped at 16 × 8 KiB (8,192 UTF-8 bytes each).

## Provider access

Settings accept a base URL, model and API key; the key stays in tab memory and is sent only to that provider. `pnpm --filter @smithers/tui-docs start` serves the portable Node server, which offers sponsored access when `OPENROUTER_API_KEY` is set server-side. Among eligible text models with at least 32K context, it picks the lowest estimated request cost. It caps output at 2,048 tokens and defaults to $0.50 and 100 calls per UTC day plus 16 calls per visitor cookie.

## Test boundary

The native terminal suite runs from `apps/tui` with `bun test ./e2e` in isolated tmux panes, or through `//apps/tui:e2eTests` in the workspace runner. It covers the source renderer and packaged Node and compiled runtimes, using deterministic model replies with real terminal input, file effects, and saved receipts. The unit suite is `bun test ./test`; prerequisites and coverage are in `apps/tui/docs/testing.md`. Native terminal tests and documentation recordings use separate PTY drivers.

The `test` script runs the Node unit tests, and `test:browser` runs the playground's browser suite against a controlled HTTP provider, including the former guide redirects. They are offline correctness tests, not evidence of a live model's quality or a hosted deployment. The Cloud `docs` gate runs the typecheck and unit tests.
