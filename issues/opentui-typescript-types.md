# OpenTUI TypeScript Types Integration

<issue>
<summary>
The `src/tui` directory is currently excluded from TypeScript checking because OpenTUI's React renderer uses custom JSX properties (`fg`, `bg`, `focusedBackgroundColor`, etc.) that conflict with React's standard `CSSProperties` types. We need a proper solution that enables full type safety for TUI components.
</summary>

<motivation>
## Why This Matters

1. **Type Safety Gap**: The TUI code runs without type checking, meaning type errors only surface at runtime
2. **IDE Experience**: Developers don't get autocomplete or error highlighting for OpenTUI-specific props
3. **Maintenance Risk**: Refactoring without type safety increases regression risk
</motivation>
</issue>

---

## Current State

### Problem

OpenTUI's React renderer (`@opentui/react`) defines custom JSX intrinsic elements with terminal-specific style properties:

```typescript
// From @opentui/core TextBufferOptions
interface TextBufferOptions {
  fg?: string | RGBA      // foreground color
  bg?: string | RGBA      // background color  
  selectionBg?: string | RGBA
  selectionFg?: string | RGBA
  // ...
}

// From @opentui/core BoxOptions
interface BoxOptions {
  backgroundColor?: string | RGBA
  borderColor?: string | RGBA
  focusedBorderColor?: ColorInput
  // ...
}
```

These properties are used in the `style` prop but don't exist in React's `CSSProperties`:

```tsx
// src/tui/App.tsx - causes TS error
<text content="Loading..." style={{ fg: '#888888' }} />
//                                  ^^ Property 'fg' does not exist on type 'Properties<string | number, string & {}>'
```

### Current Workaround

1. **Excluded from tsconfig.json**:
```json
{
  "exclude": ["src/tui"]
}
```

2. **Partial type augmentation** in `src/tui/opentui.d.ts`:
```typescript
declare module 'react' {
  interface CSSProperties {
    fg?: string
    bg?: string
    focusedBackgroundColor?: string
    [key: string]: unknown  // catch-all (loses type safety)
  }
}
```

---

## Proper Solution: Use OpenTUI's JSX Types

OpenTUI provides its own JSX namespace with proper types. The correct approach:

### Option 1: Separate tsconfig with jsxImportSource

Create `src/tui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react"
  },
  "include": ["./**/*"]
}
```

**Blocker**: The TUI code imports from `../db`, `../reactive-sqlite`, etc. TypeScript's composite projects require all imports to be within `rootDir`, which breaks cross-directory imports.

### Option 2: Refactor TUI as Standalone Package

Move `src/tui` to a separate package in a monorepo structure:
```
packages/
  smithers-core/     # Current src/ minus tui
  smithers-tui/      # Standalone TUI with own tsconfig
```

This cleanly separates the two JSX runtimes (React for Smithers orchestration, OpenTUI for terminal UI).

### Option 3: Module Augmentation (Current Approach, Improved)

Keep the type augmentation but make it more precise:

```typescript
// src/tui/opentui.d.ts
import type { TextBufferOptions, BoxOptions } from '@opentui/core'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      text: TextBufferOptions & { content?: string; children?: React.ReactNode }
      box: BoxOptions & { children?: React.ReactNode }
      scrollbox: BoxOptions & { focused?: boolean; children?: React.ReactNode }
      input: InputRenderableOptions & { focused?: boolean }
      // ... etc
    }
  }
}
```

**Limitation**: Still doesn't handle `style` prop correctly since OpenTUI uses props directly, not nested in `style`.

---

## OpenTUI Architecture Context

### How OpenTUI Typing Works

From `reference/opentui/packages/react/jsx-namespace.d.ts`:

```typescript
export namespace JSX {
  interface IntrinsicElements extends React.JSX.IntrinsicElements, ExtendedIntrinsicElements<OpenTUIComponents> {
    box: BoxProps
    text: TextProps
    // ...
  }
}
```

The key insight: OpenTUI **extends** React's JSX namespace rather than replacing it. This means elements like `<div>` still work alongside `<box>`.

### Style Prop vs Direct Props

OpenTUI supports both patterns:
```tsx
// Direct props (preferred)
<text fg="#ffffff" bg="#000000">Hello</text>

// Style prop (also works)
<text style={{ fg: "#ffffff", bg: "#000000" }}>Hello</text>
```

Our TUI code uses the `style` prop pattern, which is causing type issues.

---

## Recommended Path Forward

1. **Short term**: Keep current exclusion, improve `opentui.d.ts` with more complete type definitions

2. **Medium term**: Refactor TUI components to use direct props instead of `style` prop:
   ```tsx
   // Before
   <text style={{ fg: '#888' }} content="Loading..." />
   
   // After  
   <text fg="#888" content="Loading..." />
   ```

3. **Long term**: Consider monorepo structure if TUI becomes a significant part of the project

---

## Files Involved

- `src/tui/` - All TUI components (excluded from typecheck)
- `src/tui/opentui.d.ts` - Current type augmentations
- `tsconfig.json` - Excludes `src/tui`
- `reference/opentui/` - OpenTUI submodule for reference

## References

- OpenTUI npm docs: https://www.npmjs.com/package/@opentui/react
- OpenTUI GitHub: https://github.com/anomalyco/opentui
- OpenTUI React types: `reference/opentui/packages/react/jsx-namespace.d.ts`
- OpenTUI core options: `reference/opentui/packages/core/src/Renderable.ts`
