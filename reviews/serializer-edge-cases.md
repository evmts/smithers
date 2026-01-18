# Serializer Edge Cases

**Severity:** Low
**File:** `src/reconciler/serialize.ts`
**Status:** Open

## Problem

Two edge cases in the XML serializer can cause issues:

### 1. Circular Objects in Props

`JSON.stringify(value)` will throw on circular references:

```ts
const obj = { foo: 'bar' }
obj.self = obj  // circular reference
<Component data={obj} />  // Will throw during serialization
```

### 2. Indentation Changes Text Fidelity

Pretty-printing inserts newlines/indentation, making serialized XML text content not "byte-for-byte" equal to original:

```tsx
<Message>Hello world</Message>
```

Serializes to:

```xml
<Message>
  Hello world
</Message>
```

If this XML is only for display/approval, fine. If it becomes an execution input, whitespace changes could matter.

## Recommended Fixes

### Fix 1: Handle Circular References

Wrap `JSON.stringify` with error handling:

```ts
if (typeof value === 'object') {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch (e) {
    json = '"[unserializable]"'
  }
  return ` ${key}="${escapeXml(json)}"`
}
```

### Fix 2: Add Compact Mode (Optional)

If XML is used as execution input, provide a compact mode that avoids whitespace around pure text children:

```ts
export function serialize(
  node: SmithersNode,
  depth = 0,
  compact = false
): string {
  const indent = compact ? '' : '  '.repeat(depth)
  const newline = compact ? '' : '\n'
  // ... use indent and newline variables
}
```

## Impact

### Circular References
- **Severity:** Low-Medium
- **Likelihood:** Low (most props are plain data)
- **Fix Priority:** Medium (good defensive coding)

### Text Fidelity
- **Severity:** Low
- **Likelihood:** High (affects all text content)
- **Fix Priority:** Low if XML is display-only, High if used as input

## Recommendation

1. **Implement circular reference handling** (defensive coding best practice)
2. **Evaluate if compact mode is needed** based on whether serialized XML is used for execution
3. **Document serialization limitations** if compact mode is not added

## Current Behavior

Escaping order (& first) is correct. Prop filtering is reasonable and includes "no functions" backstop. These edge cases are the only gaps.
