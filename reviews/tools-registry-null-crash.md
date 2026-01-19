# Registry: isCustomTool/isMCPServer Crash on null

**File:** `src/tools/registry.ts`  
**Lines:** 91-100

## Issue

Type guards crash on `null`:

```typescript
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return typeof spec === 'object' && 'execute' in spec  // TypeError: Cannot use 'in' on null
}

export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && 'command' in spec && !('execute' in spec)
}
```

`typeof null === 'object'` is true, so `'execute' in null` throws.

Tests document this at lines 154-156 and 230-231.

## Impact

If array passed to `parseToolSpecs` contains `null`, runtime crash.

## Fix

Add null check:

```typescript
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return typeof spec === 'object' && spec !== null && 'execute' in spec
}

export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && spec !== null && 'command' in spec && !('execute' in spec)
}
```
