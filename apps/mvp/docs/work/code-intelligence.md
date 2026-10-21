---
title: Code intelligence in the file view (hover, go to definition, diagnostics)
status: in-progress
area: app
owner: Design-first code intelligence builder assigned by lead
updated: 2026-10-20
links: [../design/code-intelligence/DESIGN.md, ../features/code-intelligence.md, old-app-feature-gaps.md, repo-clone-and-view.md, agent-repo-navigation.md, sandboxes.md, ../decisions/0006-repo-clone-and-view.md, ../../../../AGENTS.md]
---

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
