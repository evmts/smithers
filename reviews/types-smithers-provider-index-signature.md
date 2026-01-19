# Type Safety Issue: Index signature allows any property

## Files & Lines

- `src/components/SmithersProvider.tsx:116` - `[key: string]: any` in `SmithersConfig`

## Issue

The `SmithersConfig` interface has an index signature `[key: string]: any` which allows any property with any value type. This defeats TypeScript's type checking for config objects.

## Suggested Fix

Either remove the index signature and explicitly define allowed properties:

```typescript
export interface SmithersConfig {
  maxIterations?: number
  defaultModel?: string
  globalTimeout?: number
  verbose?: boolean
}
```

Or if extensibility is needed, use a separate `extra` field:

```typescript
export interface SmithersConfig {
  maxIterations?: number
  defaultModel?: string
  globalTimeout?: number
  verbose?: boolean
  extra?: Record<string, unknown>
}
```

This keeps the core config typed while allowing extension.
