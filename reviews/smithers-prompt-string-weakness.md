# Smithers.tsx Prompt-as-String Serialization Weakness

**Severity:** P2 - Medium
**Files:** `src/components/Smithers.tsx`
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

## Recommended Fixes

### Option 1: Enforce text-only in types/docs

```tsx
interface SmithersProps {
  children: string  // Only raw text allowed
}
```

Document that structured prompts must use explicit props.

### Option 2: Build prompt serializer

```tsx
import { serializePrompt } from '../utils/prompt-serializer'

const task = serializePrompt(props.children)
// Recursively extracts text content from JSX tree
```

### Option 3: Accept prompt prop explicitly

```tsx
<Smithers prompt="Analyze the code" />
// or
<Smithers prompt={buildPrompt(context)} />
```

## Related

- Same issue in Claude.tsx (separate review exists)
- Prompt serialization needed for consistent handling across all executor components
