# TypeScript Configuration Guide

This document explains the TypeScript configuration for Smithers and how to avoid common type errors.

## Quick Verification

```bash
# Type check without building
bun run typecheck

# Build with type checking
bun run build

# Should see no errors ✅
```

## The #1 Most Critical File: jsx.d.ts

**Location:** `src/jsx.d.ts`

This file tells TypeScript about your custom JSX elements. Without it, you'll get hundreds of errors like:

```
❌ Property 'claude' does not exist on type 'JSX.IntrinsicElements'
```

**How it works:**

```typescript
import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      claude: {
        model?: string
        onFinished?: (result: unknown) => void
        children?: JSX.Element
        key?: string | number
        [key: string]: unknown
      }
      // ... other custom elements
    }
  }
}
```

**Key points:**
- `import 'solid-js'` loads Solid's types
- `declare module 'solid-js'` augments existing types
- `namespace JSX` targets Solid's JSX namespace
- `interface IntrinsicElements` is where HTML/custom elements live
- Each element needs `key?: string | number` for Ralph Wiggum loop
- Use `[key: string]: unknown` to allow arbitrary props

## Common Type Errors and Fixes

### Error: "Cannot find name 'setTimeout'"

**Problem:** Missing DOM lib

```typescript
// ❌ tsconfig.json
{
  "compilerOptions": {
    "lib": ["ES2020"]  // Missing DOM!
  }
}
```

**Fix:**

```typescript
// ✅ tsconfig.json
{
  "compilerOptions": {
    "lib": ["ES2020", "DOM"]  // Adds setTimeout, Promise, etc.
  }
}
```

### Error: "Cannot find name 'process'"

**Problem:** Node.js process global not defined

**Fix:** Create `src/globals.d.ts`:

```typescript
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string
      MOCK_MODE?: string
    }
  }

  var process: {
    env: NodeJS.ProcessEnv
  }
}

export {}
```

### Error: "File is not under 'rootDir'"

**Problem:** Test files being compiled by tsc

```typescript
// ❌ tsconfig.json
{
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]  // Don't include test/
}
```

**Fix:**

```typescript
// ✅ tsconfig.json
{
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src/**/*"],  // Only src/
  "exclude": ["test", "examples", "**/*.test.ts", "**/*.test.tsx"]
}
```

### Error: "Type 'Element' is not assignable to type 'SmithersNode'"

**Problem:** Renderer type conversion

```typescript
// ❌ Wrong
disposeFunction = render(App, rootNode)
```

**Fix:**

```typescript
// ✅ Right - Add type assertion
// The renderer handles JSX.Element → SmithersNode conversion internally
disposeFunction = render(App as any, rootNode)
```

### Error: "Parameter implicitly has 'any' type"

**Problem:** Implicit any in callbacks

```typescript
// ❌ Wrong
setKey(k => k + 1)
```

**Fix:**

```typescript
// ✅ Right - Explicitly type parameters
setKey((k: number) => k + 1)
```

### Error: "unused parameter/variable"

**Problem:** Strict mode catches unused vars

```typescript
// ❌ Wrong
function extractOutput(tree: SmithersNode): unknown {
  // TODO: Implement
  return null
}
```

**Fix:**

```typescript
// ✅ Right - Prefix with underscore
function extractOutput(_tree: SmithersNode): unknown {
  // TODO: Implement
  return null
}
```

## TypeScript Configuration Explained

### Output Configuration

```json
{
  "outDir": "./dist",           // Where compiled files go
  "rootDir": "./src",           // All source files must be in src/
  "declaration": true,          // Generate .d.ts files
  "declarationMap": true,       // Generate .d.ts.map for debugging
  "sourceMap": true             // Generate .js.map for debugging
}
```

### JSX Configuration

```json
{
  "jsx": "preserve",            // Don't compile JSX (vite-plugin-solid does it)
  "jsxImportSource": "solid-js" // Use Solid's JSX, not React's
}
```

**Why "preserve"?**
- TypeScript doesn't compile JSX to JS
- vite-plugin-solid handles JSX transpilation
- This prevents double-compilation

### Module System

```json
{
  "module": "ESNext",           // Modern ES modules
  "moduleResolution": "bundler", // Use bundler resolution (Vite/Bun)
  "target": "ES2020"            // Compile to ES2020
}
```

### Type Checking

```json
{
  "strict": true,                    // All strict checks
  "noUnusedLocals": true,           // Catch unused variables
  "noUnusedParameters": true,       // Catch unused parameters
  "noFallthroughCasesInSwitch": true // Catch missing breaks
}
```

### Library Configuration

```json
{
  "lib": ["ES2020", "DOM"]  // ES2020 features + browser APIs
}
```

**What each provides:**
- **ES2020**: async/await, optional chaining, nullish coalescing, BigInt, etc.
- **DOM**: setTimeout, Promise, console, fetch, localStorage, etc.

### Performance

```json
{
  "skipLibCheck": true  // Skip checking node_modules (faster builds)
}
```

### Types

```json
{
  "types": []  // Don't auto-include @types/* packages
}
```

**Why empty?**
- Prevents accidental inclusion of test types in build
- Vitest types only needed in test environment
- Keeps build types clean

## File Structure

```
src/
  jsx.d.ts              ← Custom JSX elements (CRITICAL!)
  globals.d.ts          ← Global type declarations (process, etc.)
  index.ts              ← Main entry point

  core/
    types.ts            ← Core type definitions
    serialize.ts
    execute.ts
    root.ts

  solid/
    renderer.ts         ← TypeScript source
    renderer.js         ← JavaScript for Vite (NOT compiled by tsc)
    root.ts

  components/
    Claude.tsx
    Ralph.tsx
    Phase.tsx

tsconfig.json           ← TypeScript configuration
vitest.config.ts        ← Test configuration (handles test types)
package.json
```

## Build Scripts

```json
{
  "scripts": {
    "build": "tsc",              // Compile TypeScript
    "dev": "tsc --watch",        // Watch mode
    "typecheck": "tsc --noEmit", // Type check only (fast)
    "clean": "rm -rf dist",      // Clean build artifacts
    "test": "vitest run",        // Run tests
    "test:watch": "vitest"       // Test watch mode
  }
}
```

## Verification Checklist

✅ **Step 1: Type check passes**
```bash
bun run typecheck
# Should see: no output (success)
```

✅ **Step 2: Build succeeds**
```bash
bun run build
# Should see: dist/ folder created with .js and .d.ts files
```

✅ **Step 3: Check generated files**
```bash
ls dist/
# Should see: index.js, index.d.ts, core/, solid/, components/

ls dist/core/
# Should see: types.js, types.d.ts, serialize.js, serialize.d.ts, etc.
```

✅ **Step 4: Verify jsx.d.ts included**
```bash
npx tsc --listFiles | grep jsx.d.ts
# Should see: /path/to/src/jsx.d.ts
```

✅ **Step 5: No JSX errors in editor**
Open any .tsx file - should have NO red squiggles on custom elements:
```tsx
<claude model="sonnet">
  <ralph maxIterations={3}>
    <phase>Test</phase>
  </ralph>
</claude>
```

## Debug Commands

```bash
# See what files tsc is compiling
npx tsc --listFiles | grep -v node_modules

# Check if jsx.d.ts is included
npx tsc --listFiles | grep jsx.d.ts

# Verify types are generated
ls -la dist/*.d.ts

# Show effective tsconfig
npx tsc --showConfig
```

## Common Mistakes

1. ❌ **Forgetting jsx.d.ts** - Custom elements won't be recognized
2. ❌ **Not excluding test/** - Get rootDir errors
3. ❌ **Missing DOM lib** - setTimeout, Promise undefined
4. ❌ **Wrong Solid import** - Using `solid-js/dist/solid.js` instead of `solid-js`
5. ❌ **Not using jsx: "preserve"** - JSX gets double-compiled
6. ❌ **Including tests in build** - Compilation fails
7. ❌ **Missing JSX.Element return types** - Type errors in components

## Success Criteria

- ✅ `bun run build` succeeds with no errors
- ✅ `bun run typecheck` passes
- ✅ No red squiggles on JSX in editor
- ✅ `dist/` contains both `.js` and `.d.ts` files
- ✅ All tests type-check and run
- ✅ Can import types: `import type { SmithersNode } from 'smithers'`
- ✅ Custom elements have autocomplete in editor

## Type-Safe Component Example

```typescript
import { createSignal, onMount, type JSX } from 'solid-js'

export interface ClaudeProps {
  model?: string
  onFinished?: (result: unknown) => void
  children?: JSX.Element
}

// ✅ Always specify JSX.Element return type
export function Claude(props: ClaudeProps): JSX.Element {
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete'>('pending')

  onMount(() => {
    (async () => {
      setStatus('running')
      // ... execution logic
      setStatus('complete')
    })()
  })

  return (
    <claude status={status()} model={props.model}>
      {props.children}
    </claude>
  )
}
```

## Key Takeaways

1. **jsx.d.ts is the most critical file** - Without it, nothing works
2. **Add "DOM" to lib** - Needed for browser APIs
3. **Use jsx: "preserve"** - Let vite-plugin-solid handle JSX
4. **Exclude test/ from build** - Only compile src/
5. **Add type assertions where needed** - For renderer type conversions
6. **Prefix unused params with _** - Satisfies strict mode
7. **Always return JSX.Element** - From component functions
