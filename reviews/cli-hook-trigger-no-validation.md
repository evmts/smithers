# CLI: hook-trigger missing type validation

## Location
- **File**: [bin/cli.ts](file:///Users/williamcory/smithers/bin/cli.ts#L66-L94)
- **Lines**: 66-94

## Issue
The `hook-trigger` command accepts any arbitrary `<type>` string without validation. No enumeration of valid hook types exists, allowing users to pass meaningless values.

## Suggested Fix
```typescript
const VALID_HOOK_TYPES = ['pre-commit', 'post-commit', 'pre-push', 'post-merge'] as const

program
  .command("hook-trigger <type> <data>")
  .description("Trigger a hook event (used by git hooks)")
  .option("--path <path>", "Database path", ".smithers/data/smithers.db")
  .action(async (type: string, data: string, options: { path: string }) => {
    if (!VALID_HOOK_TYPES.includes(type as any)) {
      console.error(`❌ Invalid hook type: ${type}`)
      console.error(`   Valid types: ${VALID_HOOK_TYPES.join(', ')}`)
      process.exit(1)
    }
    // ... rest of handler
  });
```
