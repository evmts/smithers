# Option 6: Remove Ralph/While Duplication

**Priority: LOW** | **Effort: XS (30 min)** | **Impact: LOW**

## Problem

Ralph.tsx is just an alias for While:

```typescript
// src/components/Ralph.tsx - entire file
import type { ReactNode } from 'react'
import { While, type WhileProps } from './While.js'

export interface RalphProps extends WhileProps {}

export function Ralph(props: RalphProps): ReactNode {
  return <While {...props} />
}

export { useWhileIteration as useRalphIteration } from './While.js'
```

This creates:
- Two names for same thing (`Ralph` vs `While`)
- Confusion in docs ("What's the difference?")
- Extra exports to maintain

## Current Exports

```typescript
// From components/index.ts
export { Ralph, type RalphProps, useRalphIteration } from './Ralph.js'
export { While, useWhileIteration, type WhileProps } from './While.js'
export { useRequireRalph, useRalphContext } from './While.js'
```

## Context

"Ralph" comes from the [Ralph pattern](https://ghuntley.com/ralph/) - an autonomous agent loop. The name is meaningful to some users.

However, `While` is more generic and self-explanatory.

## Options

### Option A: Keep Ralph, Delete While Export

Ralph is the branded name. Keep it, make While internal.

```diff
// components/index.ts
export { Ralph, type RalphProps, useRalphIteration } from './Ralph.js'
- export { While, useWhileIteration, type WhileProps } from './While.js'
export { useRequireRalph, useRalphContext } from './While.js'
```

### Option B: Keep While, Deprecate Ralph

While is more intuitive. Deprecate Ralph.

```typescript
/** @deprecated Use While instead */
export const Ralph = While
```

### Option C: Keep Both (Status Quo)

Some users know Ralph, some prefer While. Minimal harm.

## Recommendation

**Option A** - Keep Ralph as the primary name since:
1. It's the project's branded term
2. README uses Ralph extensively
3. `useRequireRalph` hook exists
4. While is implementation detail

Rename internal file from While.tsx to Ralph.tsx (optional).

## Benefits

1. **Single name to learn** - less confusion
2. **Cleaner exports** - one component, not two
3. **Consistent branding** - Ralph everywhere

## Decision

- [ ] **Accept A** - Keep Ralph, remove While export
- [ ] **Accept B** - Keep While, deprecate Ralph
- [x] **Accept C** - Keep both, only document Ralph

**Resolution:** Keep While as undocumented escape hatch. Ralph is the public API.
