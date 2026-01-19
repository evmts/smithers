# TUI TypeScript Coverage Gaps

**Scope:** major
**Severity:** P1
**Status:** Open

## Summary
TUI code is excluded from TypeScript checks and the local OpenTUI type shim is incomplete. This hides real errors in UI code that ships through `bin/cli.ts`.

## Current State
- `tsconfig.json` excludes `src/tui`, so no typechecking or autocomplete for TUI.
- `src/tui/opentui.d.ts` duplicates OpenTUI types but omits `<text>` and `<input>` and keeps permissive index signatures.
- `bin/cli.ts` imports `src/tui/index.tsx`, so TUI type drift directly affects runtime.

## Issues
1) **Typechecking disabled for TUI**
   - File: `tsconfig.json`
   - Result: TUI compile errors are silently ignored.

2) **Incomplete intrinsic element typings**
   - File: `src/tui/opentui.d.ts`
   - Missing: `text`, `input` (both used throughout TUI views).
   - Styles duplicated between `CSSProperties` augmentation and `OpenTUIStyle`.

## Recommended Fix
Prefer upstream OpenTUI JSX namespace types and restore TUI to typecheck:

- Add a TUI-specific tsconfig (pick one):
  - `tsconfig.tui.json` at repo root, or
  - `src/tui/tsconfig.json` scoped to TUI.
- Ensure it enables JSX and includes OpenTUI types:
  - Add `types: ["@opentui/react/jsx-namespace"]` to the TUI config, or
  - Add `/// <reference types="@opentui/react/jsx-namespace" />` to a local d.ts file.
- Remove `src/tui` from the root `tsconfig.json` exclude list once types compile.

If you keep the local shim instead of upstream types:
- Add `text` and `input` to `JSX.IntrinsicElements`.
- Remove the duplicate style prop declarations (prefer `CSSProperties`).
- Drop `[key: string]: unknown` unless absolutely required for runtime.

## Implementation Steps
1) Create `tsconfig.tui.json` (or `src/tui/tsconfig.json`) with:
   - `extends` root config
   - `include: ["src/tui/**/*"]`
   - `types: ["@opentui/react/jsx-namespace"]`
2) Update or replace `src/tui/opentui.d.ts` to align with upstream types.
3) Remove `src/tui` from `tsconfig.json` `exclude`.
4) Run:
   - `bunx tsc --noEmit -p tsconfig.tui.json`
   - `bunx tsc --noEmit`

## Notes
- `src/tui/opentui.d.ts` currently supplies `<box>`/`<scrollbox>` typings. Make sure those remain when switching to upstream definitions.
- This change should be isolated from reconciler JSX runtime behavior; it only affects TUI typing.
