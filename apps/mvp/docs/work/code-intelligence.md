---
title: Code intelligence in the file view (hover, go to definition, diagnostics)
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, repo-clone-and-view.md, agent-repo-navigation.md, sandboxes.md, ../decisions/0006-repo-clone-and-view.md, ../../../../AGENTS.md]
---

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
