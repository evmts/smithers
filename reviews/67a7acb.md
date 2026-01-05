# Review: 67a7acb

**Commit:** 67a7acb48b4cdc94518bd2062de78dfcebb9cc0d
**Message:** feat: integrate Claude SDK for real API execution
**Date:** 2026-01-05 23:13:39 UTC

## Feedback

- `src/core/claude-executor.ts:181` `getChildrenText` appends `node.props.children` when it’s a string while also iterating `node.children`. For text children, the reconciler already creates a `TEXT` node, so this duplicates prompt text. Fix by removing the `props.children` branch or only using it when `node.children.length === 0`.
- `src/core/claude-executor.ts:206` `convertTools` assumes `tool.parameters` is a properties map with per-property `required` flags. That’s not valid JSON Schema and will generate invalid `input_schema` if callers pass a standard schema (likely). Fix by defining `Tool.parameters` as a JSON Schema object and pass it through directly, or add detection to support both shapes and respect top-level `required`.
