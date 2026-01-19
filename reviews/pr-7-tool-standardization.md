# PR #7 Review: Tool Standardization

**PR:** issue/tool-standardization
**Status:** Approve with comments

---

## Summary

Adopts Vercel AI SDK tool format with:
- `createSmithersTool()` helper with Zod schemas
- `parseToolSpecs()` for mixed tool type handling
- `toolToMCPDefinition()` for MCP bridging
- `smithers-mcp-server.ts` for tool execution
- Claude.tsx integration for automatic MCP config generation

## Positive

1. **Type-safe tools** - Zod schemas provide compile-time checking
2. **Backward compatible** - Legacy tools still work (with warning)
3. **Clean separation** - registry.ts, tool-to-mcp.ts, createSmithersTool.ts
4. **MCP bridge** - Clever approach to expose AI SDK tools via MCP server
5. **Tests updated** - Claude.test.tsx verifies SmithersTool integration
6. **README updated** - Clear documentation with example

## Issues

### 1. Heavy Dependency
`ai` package (v3.0.33) adds significant dependencies:
- @ai-sdk/react, @ai-sdk/solid, @ai-sdk/svelte, @ai-sdk/vue
- Vue, Svelte compilers pulled in as transitive deps

Consider using only `@ai-sdk/provider-utils` if full SDK not needed.

### 2. Tool Execution Context
`SmithersToolContext` passed via `experimental_context` is marked experimental in AI SDK:
```typescript
const smithersContext = executionOptions.experimental_context as SmithersToolContext
```
This API may change. Document the risk or vendor the tool wrapper.

### 3. MCP Server Path Resolution
```typescript
const SMITHERS_MCP_SERVER_PATH = fileURLToPath(
  new URL('../tools/smithers-mcp-server.ts', import.meta.url)
)
```
Assumes running from source. Won't work if Smithers is installed as npm package. Add fallback for production paths.

### 4. Generator Execution Not Supported
Issue spec mentions streaming tool results via generators. Claude CLI doesn't support this - should document the limitation.

## Verdict

**APPROVE** - Significant improvement to tool ergonomics. Dependency size is trade-off worth making.

---

## Action Items
- [ ] Document `experimental_context` stability risk
- [ ] Add production path fallback for MCP server
- [ ] Document generator limitation in README
- [ ] Consider trimming unused AI SDK framework adapters

## Status: RESOLVED

**Evidence:** PR #7 was never merged. The codebase uses a simpler tool system:

- No `ai` or `@ai-sdk/*` packages in [package.json](file:///Users/williamcory/smithers/package.json)
- No `createSmithersTool()` function exists
- No `experimental_context` usage
- No `smithers-mcp-server.ts` or `toolToMCPDefinition()`
- [registry.ts](file:///Users/williamcory/smithers/src/tools/registry.ts) uses a plain `Tool` interface with `inputSchema: JSONSchema` (no Zod)

The review concerns are moot since the proposed AI SDK integration approach was not adopted.
