# CLI: hook-trigger doesn't validate/parse data parameter

## Location
- **File**: [bin/cli.ts](file:///Users/williamcory/smithers/bin/cli.ts#L66-L94)
- **Lines**: 77-85

## Issue
The `<data>` parameter is stored as a raw string without validation. If it's expected to be JSON, malformed input is silently accepted. The help text doesn't document expected format.

## Current Code
```typescript
db.state.set(
  "last_hook_trigger",
  {
    type,
    data, // raw string, no validation
    timestamp: Date.now(),
  },
  "hook-trigger",
);
```

## Suggested Fix
```typescript
.description("Trigger a hook event (used by git hooks). Data should be JSON.")

// In action:
let parsedData: unknown
try {
  parsedData = JSON.parse(data)
} catch {
  console.error(`❌ Invalid JSON data: ${data}`)
  console.error('   Data must be valid JSON')
  process.exit(1)
}

db.state.set("last_hook_trigger", {
  type,
  data: parsedData,
  timestamp: Date.now(),
}, "hook-trigger")
```
