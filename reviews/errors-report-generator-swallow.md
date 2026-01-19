# Swallowed Error in Report Generator

## File

- [src/tui/services/report-generator.ts](file:///Users/williamcory/smithers/src/tui/services/report-generator.ts#L145-L147)

## Issue Description

The `getClaudeAnalysis` function silently swallows API errors:

```typescript
} catch {
  return null
}
```

This makes it impossible to distinguish between:
- API key issues
- Rate limiting
- Network failures
- Service outages

## Suggested Fix

Log errors at warning level while still returning null:

```typescript
} catch (err) {
  console.warn('[report-generator] Claude analysis failed:', err instanceof Error ? err.message : err)
  return null
}
```
