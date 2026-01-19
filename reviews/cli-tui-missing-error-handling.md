# CLI: tui command missing error handling

## Location
- **File**: [bin/cli.ts](file:///Users/williamcory/smithers/bin/cli.ts#L56-L62)
- **Lines**: 56-62

## Issue
The `tui` command has no error handling. If `launchTUI` throws (e.g., database not found, terminal not supported), user gets an unhandled promise rejection.

## Current Code
```typescript
.action(async (options: { path: string }) => {
  await launchTUI({ dbPath: options.path });
});
```

## Suggested Fix
```typescript
.action(async (options: { path: string }) => {
  try {
    await launchTUI({ dbPath: options.path });
  } catch (error) {
    console.error('❌ Failed to launch TUI:', error instanceof Error ? error.message : error);
    if (!process.stdout.isTTY) {
      console.error('   TUI requires an interactive terminal');
    }
    process.exit(1);
  }
});
```
