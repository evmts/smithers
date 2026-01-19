# Tools Module Improvements

## Summary

Analysis of `src/tools/` reveals 83 passing tests, no type errors, and several opportunities for cleanup and enhancement.

## Issues Found (Prioritized)

### P1: Type Duplication (registry.ts vs types.ts)

**Problem:** `MCPServer` and `ToolSpec` are defined in both files with slight differences.

| Location | Definition |
|----------|------------|
| `registry.ts:32-37` | `MCPServer { name, command, args?, env? }` |
| `types.ts:40-45` | Identical `MCPServer` |
| `registry.ts:86` | `ToolSpec = string \| Tool \| MCPServer` |
| `types.ts:54-58` | `ToolSpec = string \| SmithersTool \| MCPServer \| LegacyTool` |

**Fix:**
1. Remove `MCPServer` from `registry.ts`, import from `types.ts`
2. Remove `ToolSpec` from `registry.ts`, import from `types.ts`
3. Update `registry.ts` to use `types.ts` definitions

### P2: Incomplete MCP Server Implementation

**Problem:** `smithers-mcp-server.ts` exits with code 1 and logs "MCP execution is not implemented."

**Location:** `smithers-mcp-server.ts:6-9`

**Fix:** Either:
- Implement actual MCP tool execution
- Or mark as stub with TODO and not export from index

### P3: Missing Test for tool-to-mcp.ts createSmithersToolServer

**Problem:** `createSmithersToolServer` function has no dedicated tests.

**Location:** `tool-to-mcp.ts:28-41`

**Fix:** Add tests in `createSmithersTool.test.ts` or new `tool-to-mcp.test.ts`:
- Test server config generation
- Test tool definition serialization
- Test empty tools case

### P4: Console.log in Production Code

**Problem:** `ReportTool.ts:94` uses `console.log` instead of context.log

**Location:** `ReportTool.ts:94`

```typescript
console.log(`[Report] ${severity.toUpperCase()}: ${input.title}`)
```

**Fix:** Use `context.log()` for proper logging integration.

### P5: Stub Context in createSmithersTool

**Problem:** When no context provided, creates stub context with empty db object.

**Location:** `createSmithersTool.ts:35-42`

```typescript
{
  db: {} as SmithersToolContext['db'],
  agentId: 'stub',
  executionId: 'stub',
  // ...
}
```

**Fix:** Either throw error when context missing, or document this as intentional fallback behavior.

## Refactoring Opportunities

### R1: Consolidate Type Exports

Currently index.ts exports types from both registry.ts and types.ts. After P1 fix, simplify:

```typescript
// Single source of truth for types
export type { ... } from './types.js'
// Registry exports only functions and BUILTIN_TOOLS const
export { BUILTIN_TOOLS, isBuiltinTool, ... } from './registry.js'
```

### R2: Add JSDoc to Public Functions

Functions like `parseToolSpecs`, `buildToolFlags` lack JSDoc describing:
- Return type structure
- Edge cases
- Usage examples

## New Tests Needed

1. **tool-to-mcp.test.ts** (new file)
   - `createSmithersToolServer` with multiple tools
   - `createSmithersToolServer` with empty tools
   - Server config structure validation

2. **smithers-mcp-server.test.ts** (new file)
   - Test parse error handling
   - Test valid tools parsing (when implemented)

3. **registry.test.ts** additions
   - Test `isSmithersTool` with null inputSchema._def

## Implementation Checklist

- [x] P1: Remove type duplication from registry.ts
- [x] P2: Add TODO comment to smithers-mcp-server.ts
- [x] P3: Add createSmithersToolServer tests (9 new tests in tool-to-mcp.test.ts)
- [x] P4: Replace console.log with context.log in ReportTool
- [ ] P5: Document stub context behavior (deferred - intentional fallback)
- [ ] R1: Clean up index.ts exports (deferred - maintains backward compat)
- [ ] R2: Add JSDoc comments (optional)
