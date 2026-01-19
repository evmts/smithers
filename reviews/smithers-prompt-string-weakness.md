# Smithers.tsx Prompt-as-String Serialization Weakness

**Scope:** easy
**Severity:** P2 - Medium
**Files:** `src/components/Smithers.tsx` (line 145), `src/components/Claude.tsx` (line 93)
**Status:** Open

## Problem

Smithers uses naive string coercion for children:

```tsx
const task = String(props.children)
```

Same issue as Claude component: structured JSX children become `[object Object]` instead of meaningful prompt content.

## Impact

```tsx
// This works:
<Smithers>Analyze the code</Smithers>

// This breaks:
<Smithers>
  <Persona>You are a code reviewer</Persona>
  <Task>Review the PR</Task>
</Smithers>
// Result: task = "[object Object][object Object]"
```

## Positive Note

Unlike Claude, Smithers correctly registers and completes its task, so it will **not** deadlock the iteration loop.

## Codebase Context

The reconciler has `serialize()` in `/Users/williamcory/smithers/src/reconciler/serialize.ts` that properly handles SmithersNode trees, but both affected components call `String(props.children)` before reconciler processes the JSX:

- **Smithers.tsx:145** - `const task = String(props.children)`
- **Claude.tsx:93** - `const childrenString = String(props.children)`

No existing utility exists to extract text from ReactNode children before reconciler processing.

## Recommended Fixes

### Option 1: Enforce text-only (SIMPLEST)

Update type definitions to only accept strings:

```tsx
interface SmithersProps {
  children: string  // Only raw text allowed
}

interface ClaudeProps {
  children: string  // Only raw text allowed
}
```

Add runtime validation:
```tsx
if (typeof props.children !== 'string') {
  throw new TypeError('Smithers children must be a string. Use explicit props for structured prompts.')
}
```

Document in component JSDoc that structured prompts require explicit props.

### Option 2: Create ReactNode text extractor

Build `/Users/williamcory/smithers/src/utils/extract-text.ts`:

```tsx
import { Children, isValidElement, type ReactNode } from 'react'

export function extractText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    return extractText(node.props.children)
  }
  return String(node) // fallback for edge cases
}
```

Then update both components:
```tsx
import { extractText } from '../utils/extract-text'
const task = extractText(props.children)  // instead of String(props.children)
```

### Option 3: Accept prompt prop explicitly

Add explicit prompt prop as alternative:

```tsx
interface SmithersProps {
  children?: ReactNode
  prompt?: string  // Explicit prompt overrides children
}

// In component:
const task = props.prompt ?? String(props.children)
```

## Implementation Recommendation

**Option 1 (Enforce text-only)** is recommended because:
- Simplest solution with minimal code changes
- Clear contract via TypeScript types
- Current usage patterns in codebase show these components primarily receive plain strings
- Structured prompting can be handled via other components (Persona, Task, etc.) that properly render to XML

Changes needed:
1. Update `SmithersProps.children` type from `ReactNode` to `string`
2. Update `ClaudeProps.children` type from `ReactNode` to `string`
3. Add runtime validation in both components
4. Update JSDoc comments to document the string-only requirement

## Related

- Claude.tsx has identical issue at line 93
- Both components part of agent execution system
- Other components (Persona, Task, Human, etc.) properly pass children to JSX which reconciler serializes correctly

## Debugging Plan

**Status:** RELEVANT (verified 2025-01-18)

Issue still exists at updated line numbers:
- `src/components/Smithers.tsx:191` - `const task = String(props.children)`
- `src/components/Claude.tsx:146` - `const childrenString = String(props.children)`
- Also found: `src/components/Git/Commit.tsx:112` - `message = String(props.children)`

### Files to Investigate

| File | Purpose |
|------|---------|
| `src/components/Smithers.tsx` | Line 191 - naive String() coercion |
| `src/components/Claude.tsx` | Line 146 - same issue |
| `src/components/Git/Commit.tsx` | Line 112 - same pattern |
| `src/reconciler/serialize.ts` | Existing serializer for SmithersNode trees |
| `src/utils/` | Check if extractText utility already exists |

### Grep Patterns

```bash
# Find all String(props.children) usages
grep -rn "String(props.children)" src/

# Find all String(.*children patterns
grep -rn "String(.*children" src/components/

# Check existing text extraction utilities
grep -rn "extractText\|textContent" src/utils/
```

### Test Commands to Reproduce

```tsx
// Test case in bun test or manual REPL:
import { render } from './src/reconciler'
import { Smithers, Claude } from './src/components'

// This will produce "[object Object][object Object]"
const result = <Smithers>
  <Persona>You are a reviewer</Persona>
  <Task>Review the code</Task>
</Smithers>
```

### Proposed Fix Approach

1. **Create `src/utils/extract-text.ts`** with ReactNode text extractor (Option 2 from recommendations)
2. **Update all three components** to use `extractText()` instead of `String()`
3. **Add unit tests** for extractText utility with various ReactNode inputs
4. **Consider Option 1 hybrid** - add TypeScript type narrowing + runtime warning for non-string children
