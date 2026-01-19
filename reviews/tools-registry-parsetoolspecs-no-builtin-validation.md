# Registry: parseToolSpecs Doesn't Validate Built-in Names

**File:** `src/tools/registry.ts`  
**Lines:** 112-132

## Issue

`parseToolSpecs` puts all strings into `builtinTools` without validating they're actual built-in tools:

```typescript
for (const spec of specs) {
  if (isToolName(spec)) {
    builtinTools.push(spec)  // ← no validation
  }
  // ...
}
```

Test at line 430-436 documents this:

```typescript
test('non-builtin string tool names', () => {
  const specs = ['CustomTool', 'AnotherOne', 'NotReal']
  const result = parseToolSpecs(specs)
  // Strings that are not built-in tool names are still categorized as builtin tools
  expect(result.builtinTools).toEqual(['CustomTool', 'AnotherOne', 'NotReal'])
})
```

## Impact

- Invalid tool names passed through to CLI
- No early error when typo in tool name (e.g., 'read' instead of 'Read')
- `buildToolFlags` generates invalid `--allowedTools` flags

## Fix

Either:

1. Validate and filter:
```typescript
if (isToolName(spec) && isBuiltinTool(spec)) {
  builtinTools.push(spec)
}
```

2. Or separate into `validatedBuiltins` and `unknownTools`
