---
title: Code intelligence in the file view (hover, go to definition, diagnostics)
status: in-progress
area: app
owner: Design-first code intelligence builder assigned by lead
updated: 2026-10-20
links: [../design/code-intelligence/DESIGN.md, ../features/code-intelligence.md, old-app-feature-gaps.md, repo-clone-and-view.md, agent-repo-navigation.md, sandboxes.md, ../decisions/0006-repo-clone-and-view.md, ../../../../AGENTS.md]
---

## Current specification — 2026-10-20, 21:43 PDT

**What:** Provide GitHub-style file hover, definitions, references, outline and diagnostics through shared language services.

**Why:** Will requested full language-server support and approved the first design.

**Current state:** The implementation is described below, but at 21:34 PDT the lead reports its first browser recording failed. It exercises hover, go to definition and references on a TypeScript file from vercel/ms. The curator holds priority 790 until a passing run; slice 1 is not verified working end to end.

**Next step:** Fix the failing real-viewer journey and retain a passing recording before declaring the first slice complete or broadening into agent code/* flows and sandbox language services.

**Open questions for Will:** None.

Evidence: lead text replies and human-typed messages extracted by script from session 6253ecf2 for 19:43–21:43 PDT; synthetic notifications and compaction summaries excluded. Rulings and queue answers through 19:38 PDT take precedence over older briefs, designs, decisions, proposals, TODOs and rules. Product results are reported receipts; this tracker validates the site build. Execution ownership is retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20

**What:** The code view's language server, as GitHub's code view and github.dev have it: hover, go to definition, references, the outline and problems, keyboard first. Will, about 18:22: "For code it should have full lsp support and stuff and look a lot like github".

**Current state:** Slice 1 built: TypeScript and JavaScript in a browser worker at the commit ([DESIGN.md](../design/code-intelligence/DESIGN.md), [mock](../design/code-intelligence/mock.html), [feature doc](../features/code-intelligence.md)). SDK: `@smthrs/platform-browser`'s `BrowserLanguageServer` (binds `@smthrs/std`'s `LanguageServer`), `@smthrs/repo-view`'s `CodeFileView` marks, hover card and cursor, and `SymbolsPane`. App: `src/features/code-intel/`. Hybrid placement, browser first: the branch box answers only what needs a machine (DESIGN.md).

**Proof so far (2026-10-20, 22:10):** `src/features/code-intel/code-intel.test.ts` 16 of 16 against a real clone and the real language server; `packages/smithers/flows/platform-browser/test/BrowserLanguageServer.test.ts` 25 of 25, 100% of its files; `packages/smithers/ui/repo-view` 167 of 167, 100%; `vite build` passes on the mini (entry +18.9 KB, +6.0 KB gzip; TypeScript 3.6 MB / 1.0 MB gzip only in the worker chunk). `e2e/code-intel.spec.ts` has not passed yet: on the shared dev server `vercel/ms` wasn't cloned and the first runs met a stale optimizer and a signed-out front on :1443; the spec now clones from the file's page and runs with `BASE_URL=http://localhost:1337`. It waits for the test pause.

**Follow-ups (todo):**
- Run `BASE_URL=http://localhost:1337 pnpm e2e code-intel.spec.ts` and `pnpm e2e:gifs` once the test pause lifts, then mark this done.
- `pnpm docs:sync` wrote the site pages but its `smthrs flow start docs-sync` step failed on this machine (`Cannot load flow docs-sync: Operation not permitted`), so `pnpm docs:check` hasn't passed.

**Next step:** Slice 2, the agent's `code/*` flows on the same server; then package types, the sandbox bridge, search-based navigation, blame.

**Open questions for Will:** None.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 18:33 PDT

**What:** Provide TypeScript/JavaScript hover, cross-file definitions, references and diagnostics through the repository viewer.

**Why:** Will requested full LSP support and approved the code-intelligence design at 18:30.

**Current state:** Design approval is recorded in queue answer design:auto/code-intelligence@cd86. The lead previously assigned a design-first builder; no implementation or passing browser receipt exists.

**Next step:** Implement the approved first slice with injected language services and SDK components, then verify each operation through the real viewer and review the implementation.

**Open questions for Will:** None.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:26 PDT

**What:** Add GitHub-style TypeScript and JavaScript hover, cross-file definition, references and gutter diagnostics.

**Why:** Will requested full language-server support in the repository viewer.

**Current state:** At 18:16 the lead assigned a designer/builder to produce a mock and decide browser versus branch-machine language-server placement. No completed implementation receipt.

**Next step:** Design first using catalog-backed SDK services, then implement the first TypeScript/JavaScript slice and prove each navigation operation through the real viewer.

**Open questions for Will:** None; language-server placement is an engineering choice.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:18 PDT

**What:** Provide full language-server support in the repository code viewer, with a GitHub-quality browsing experience.

**Why:** Will explicitly requested full LSP support in the repo-browser queue answer at 18:16.

**Current state:** This is now requested current work; no implementation or completion receipt in this pass.

**Next step:** Choose the catalog-backed code intelligence services, define browser/sandbox placement through injected Effect services, and prove navigation/diagnostics in the actual repository viewer.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

## Earlier tracker history (retained)

## What

Language-server help while reading code.

Old app:
- Flows `code.hover` (the type and docs of the symbol at a position), `code.definition` (opens the file at the definition's line) and `code.diagnostics` (a file's errors and warnings), in `apps/app/src/mainview/flows/entries/code.ts`.
- Hover in the file card (`cards/FileCards.tsx`). The language server ran on the branch's machine (`state/CloudLspClient.ts`).
- Journey: `apps/app/e2e/real/file-intelligence.spec.ts`.

The scope keeps it: the root `AGENTS.md` says "Keep browser IDE code intelligence", and mvp.md §8 keeps "code intelligence in file cards".

New app: Shiki highlighting only (`CodeFileView`). No plan names hover, definitions or diagnostics.

## Why

- An explicit keep rule in the root `AGENTS.md`.
- Go to definition is how a person reads unfamiliar code. It also gives [feature 4](agent-repo-navigation.md)'s agent a precise jump instead of a text search.

## How it fits

Two ways:
1. **In the browser:** the TypeScript language service in a Web Worker over Code Storage reads, for TypeScript and JavaScript repositories. It needs no machine and works offline once files are cached.
2. **On a sandbox:** real language servers on the branch's machine ([sandboxes](sandboxes.md)), exposed as sandbox tool flows `code/hover`, `code/definition` and `code/diagnostics`.

Either way, the agent calls the same flows, and results are cached per commit SHA in `ImmutableCache`.

## Size

L.

## Questions for Will

- Start with TypeScript in the browser, or wait for sandboxes and run real language servers? Recommended: TypeScript in the browser first, since it needs no machine.
