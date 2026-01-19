# CLI: recovery-view shows options but doesn't implement them

## Location
- **File**: [src/commands/db/recovery-view.ts](file:///Users/williamcory/smithers/src/commands/db/recovery-view.ts#L55-L59)
- **Lines**: 55-59

## Issue
The recovery view shows three recovery options but doesn't provide any way to execute them. Users see options but can't act on them.

## Current Code
```typescript
console.log('  Recovery Options:')
console.log('    1. Resume from last state (if possible)')
console.log('    2. Restart from beginning')
console.log('    3. Mark as failed and start new execution')
```

## Suggested Fix
Either:
1. Add actual commands to execute these options:
```typescript
console.log('  Recovery Commands:')
console.log('    smithers db recover --resume    # Resume from last state')
console.log('    smithers db recover --restart   # Restart from beginning')  
console.log('    smithers db recover --fail      # Mark as failed')
```

2. Or remove the misleading options and just show the state:
```typescript
console.log('  To recover, run: smithers run')
console.log('  The orchestration will detect the incomplete state.')
```
