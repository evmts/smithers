# TUI verification

Run from a checkout with the Node version in `.node-version`, Bun 1.4 or later,
Git, jj 0.39.0 or later, ripgrep, tmux, and the pinned Rust toolchain. Build the
native filesystem helper from the repository root:

```bash
cargo build --locked --release -p smithers-ffi --bin smithers-jj-export
```

`SMITHERS_WORKSPACE_JJ_EXPORT_BINARY` can select an installed helper instead.
`TMUX_BIN` selects tmux when it is outside `PATH`. Install Vim to include the
interactive external-editor cases; those cases explicitly skip without it.
The test runner's `PATH` must select the pinned Node for packaged-runtime tests.

From `apps/tui`:

```bash
bun test ./test
bun test ./e2e
pnpm run typecheck
pnpm run lint
```

The workspace runner exposes the same suites as `//apps/tui:unitTests` and
`//apps/tui:e2eTests`. From the repository root, run
`pnpm exec smthrs test '//apps/tui:e2eTests' --verbose` with the prerequisites
above. Keep the full output: verbose mode includes individual cases and failure
details that the agent summary can truncate.

The tmux suite runs the production renderer in private servers with an empty
configuration, explicit child environments, disposable projects, and private
conversation storage. It sends raw key bytes, captures the visible pane, and
checks files and saved receipts. Resizing changes the real PTY. Exit assertions
read the pane's exit status. Cleanup removes the suite's servers and files,
including leftovers from a killed previous run; it does not use personal tmux
sessions.

## Coverage

| Area                    | Terminal evidence                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and packaging   | Redirected-stream refusal, Node bundle, relocated compiled binary, embedded helper, dynamic project flows, shared Effect identity.                                               |
| Composer and keys       | Input bursts across focus changes, combining marks and emoji, selection replacement, multiline input, history, help, completion, model picker, and terminals down to 40 columns. |
| Search                  | Commands, files, text matches, limits, saved conversations, and worker tabs; selecting an item preserves the draft.                                                              |
| Conversations           | Continue, startup picker, names, compaction, fork, interrupted turns, queued follow-ups, torn tails, deep paths, and storage failures.                                           |
| Shell and editor        | Included/excluded command output, nonzero exits, cancellation, process-group cleanup, Vim handoff, suspended editors, resize, and missing-editor errors.                         |
| Views and changes       | Summary, diffs, split view, timeline history, custom panels, cards, mouse input, scrolling, and undo with refusal and restart cases.                                             |
| Background workers      | Saved requests, duplicate input, unresolved execution, usable chat, completion toasts, steering, cancellation, retry controls, tree navigation, and worker undo.                 |
| Flows and approvals     | Discovery, live refresh, input forms, burst navigation, short panes, quoted values, durable parks, fallback models, approval/denial, and real completion.                        |
| Extensions and monitors | Repository contributions, key conflicts, panel actions, hot reload, notable/routine updates, and shell-monitor cleanup on stop, quit, and conversation switch.                   |
| Command effects         | Typed help/navigation/resume and worker stop/retry routes, clipboard recovery, compaction persistence, and budget counts in chat, reload, and print mode.                        |

The unit suite separately exercises parsing, projections, persistence,
capabilities, worker scheduling, cancellation, and recovery. Terminal fixtures
replace model responses or deliberately hold host work unresolved; the production
UI still handles its real keys and persisted state. Replay cases execute their
cells and filesystem/shell effects against disposable projects. Packaged-runtime
cases execute both the Node bundle and the compiled binary for the current host.

Native editor tests check exact saved text, grapheme boundaries, middle insertion,
selection, deletion, undo/redo, and add-buffer growth. React tests exercise keyboard
and mouse selection in the composer, forms, and search. Packaging tests verify the
shipped library, missing-file refusal and recovery, and help/print startup without
the native editor. The [native build recipe](../../../packages/smithers/vendor/opentui-native/README.md)
records source, patch, and artifact hashes, licenses, and platform limits.

A passing local run proves behavior on its tested platform and dependencies.
It does not establish live provider quality, hosted deployment health, other
operating systems, or every possible terminal configuration. Report skips and
failures with the result. The audit is tracked in
[#2074](https://github.com/smithersai/smithers/issues/2074).

## Audit: 2026-09-27

Executed on macOS 26.6.2 arm64 with Node 26.5.0, Bun 1.4.2, tmux 3.5a,
jj 0.40.0, and Vim:

- TUI unit suite: **1,433 passed**, zero failures or skips, 8,477 assertions
  across 86 files. This includes the native editor, platform selectors,
  keyboard/mouse selection, and headless recording CLI.
- Complete tmux suite: **165 passed**, zero failures or skips, 502 assertions
  across 15 files in 433.30 seconds. The maintained
  `//apps/tui:e2eTests` target returned `ok: true`.
- A subsequent shared worker-card clipping repair passed **44 RPC tests** and
  **eight affected tmux cases** with 41 assertions. The complete terminal run
  above precedes that repair; the unit count includes it.
- TUI typecheck and lint: passed.
- Native editor: **2,158 passed**, zero failures and **34 upstream skips**.
  All eight platform artifacts cross-built with unchanged exported ABIs; the
  macOS arm64 library was independently reproduced from the pinned recipe.
- Public export contracts: **36 passed**. An actual `pnpm pack` tarball
  included all eight exact artifact hashes and loaded the public Node export.
- Playground unit suite: **32 passed**; Astro check, build, and browser recovery,
  provider, checkpoint, branch, and mobile checks passed. UTF-8 file/history
  boundary tests verify refusal, unchanged state, recovery, and reload.
- **44** executable recordings passed: 42 terminal and two browser recordings,
  all freshly generated. All 132 GIF/PNG/transcript hashes matched their
  receipts, and all **27** main-site animations matched their recorded files.
- Main-site documentation checks: **78 passed**. The site built **336 pages**
  and verified **855 required URLs** with zero failures. Generated references
  and the documentation fleet were checked for drift.
- CLI documentation: Astro check passed and the site built **18 pages** after
  refreshing the generated installation guide.

The tested host library has SHA-256
`7f44e4e92256a3bcb88f0db732da48c93a42ea3ebb963a93b5861a5412486ae2`.
Native editor, interactive sources, and E2E inputs stayed unchanged throughout
that complete terminal run. Concurrent changes were confined to unit tests and
a comment in the separate recording CLI. The unit run used the expanded,
stable test collection. A later playground wording change did not change the
terminal sources consumed by the clipping checks. No owned terminal process or private scratch directory
remained after cleanup.

These are executed behavioral results, not a claim of 100% source coverage.
Only macOS arm64 ran the native libraries and packaged terminal; cross-builds
and platform selection tests do not establish execution on other platforms.
The earlier audit's live-provider smoke completed one chat answer and delegated
README read without changing that file. It was not repeated for this artifact
and is not a model-quality benchmark.

The repairs and retained regressions are tracked in
[#2403](https://github.com/smithersai/smithers/issues/2403) (native editing),
[#2427](https://github.com/smithersai/smithers/issues/2427) (selection),
[#2423](https://github.com/smithersai/smithers/issues/2423) (replay evidence),
[#2451](https://github.com/smithersai/smithers/issues/2451) (recording output),
[#2459](https://github.com/smithersai/smithers/issues/2459) (playground byte limits),
and [#2503](https://github.com/smithersai/smithers/issues/2503) (worker-card clipping).
The campaign retains validation receipts in
[#2290](https://github.com/smithersai/smithers/issues/2290).
Required Fable review of the new product repairs remains blocked by quota;
the initial audit's review does not approve these later changes.
The repository-wide verified wiki refresh and Cloud publication remain tracked
in [#1923](https://github.com/smithersai/smithers/issues/1923).

## Documentation checks

Author guides in `apps/site/src/content/docs/docs/tui/` and the TUI tabs of
`apps/site/src/content/docs/docs/learn/`. The Commands and Keys pages are generated from the runtime
registries. From the repository root:

```bash
pnpm --filter @smithers/tui-docs sync:reference
pnpm --filter @smithers/tui-docs test
pnpm --filter @smithers/tui-docs check
pnpm --filter @smithers/tui-docs record
pnpm --filter @smithers/tui-docs build
pnpm --filter @smithers/tui-docs test:browser
pnpm --filter @smithers/site run capture:learn tui
node apps/site/scripts/generate-llms.mjs
pnpm --filter @smithers/site run check:docs
```

Recordings use the separate Python PTY driver, execute the Markdown scripts,
and retain transcripts, artifact hashes, and receipts only after their assertions
pass. The browser suite exercises the playground with a controlled HTTP provider.
See [recordings](README.md) for the additional toolchain. Documentation generation
and a local site build do not publish the repository wiki; its existing Cloud
workflow retains separate source and review receipts.
