# Index: Imports from .jsx But Files Are .ts

**File:** `src/tools/index.ts`  
**Lines:** 23, 25

## Issue

Index exports from `.jsx` extension:

```typescript
} from './registry.jsx'
export { createReportTool, getReportToolDescription } from './ReportTool.jsx'
```

But actual files are:
- `registry.ts`
- `ReportTool.ts`

## Impact

Works in Bun due to flexible resolution, but:
- Misleading - suggests JSX content when there is none
- Could break with stricter bundlers
- Inconsistent with .js/.ts pattern elsewhere

## Fix

Use `.js` extension (TypeScript convention for output):

```typescript
} from './registry.js'
export { createReportTool, getReportToolDescription } from './ReportTool.js'
```
