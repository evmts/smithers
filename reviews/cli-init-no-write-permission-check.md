# CLI: init doesn't check write permissions

## Location
- **File**: [src/commands/init.ts](file:///Users/williamcory/smithers/src/commands/init.ts#L43-L44)
- **Lines**: 43-44

## Issue
`init` creates directories without first checking if the target directory is writable. If user doesn't have write permission, they get a cryptic EACCES error.

## Current Code
```typescript
fs.mkdirSync(smithersDir, { recursive: true })
fs.mkdirSync(logsDir, { recursive: true })
```

## Suggested Fix
```typescript
// Check write permission first
try {
  fs.accessSync(targetDir, fs.constants.W_OK)
} catch {
  console.error(`❌ No write permission for directory: ${targetDir}`)
  process.exit(1)
}

try {
  fs.mkdirSync(smithersDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })
} catch (error) {
  console.error(`❌ Failed to create directories:`, error instanceof Error ? error.message : error)
  process.exit(1)
}
```
