# Registry: parseToolSpecs Allows Duplicates

**File:** `src/tools/registry.ts`  
**Lines:** 112-132

## Issue

`parseToolSpecs` preserves duplicates:

```typescript
for (const spec of specs) {
  if (isToolName(spec)) {
    builtinTools.push(spec)  // ← duplicates preserved
  }
  // ...
}
```

Test at line 374-381 documents this:

```typescript
test('handles duplicate tool names', () => {
  const specs = ['Read', 'Edit', 'Read', 'Bash', 'Edit']
  const result = parseToolSpecs(specs)
  // Duplicates are preserved (not deduplicated)
  expect(result.builtinTools).toEqual(['Read', 'Edit', 'Read', 'Bash', 'Edit'])
})
```

## Impact

- Generates `--allowedTools Read,Edit,Read,Bash,Edit`
- Wastes CLI argument space
- May confuse downstream consumers

## Fix

Use Set or filter duplicates:

```typescript
const builtinToolsSet = new Set<string>()
// ...
if (isToolName(spec) && !builtinToolsSet.has(spec)) {
  builtinToolsSet.add(spec)
  builtinTools.push(spec)
}
```

Or dedupe at output:
```typescript
return { builtinTools: [...new Set(builtinTools)], ... }
```
