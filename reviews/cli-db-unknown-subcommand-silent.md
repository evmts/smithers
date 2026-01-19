# CLI: db command silently shows help for unknown subcommand

## Location
- **File**: [src/commands/db/index.ts](file:///Users/williamcory/smithers/src/commands/db/index.ts#L61-L63)
- **Lines**: 61-63

## Issue
When an unknown subcommand is passed (e.g., `smithers db foo`), it silently falls through to `showHelp()` without indicating an error. User may not realize they made a typo.

## Current Code
```typescript
default:
  showHelp()
```

## Suggested Fix
```typescript
default:
  console.error(`❌ Unknown subcommand: ${subcommand}`)
  console.error('')
  showHelp()
  process.exit(1)
```
