# CLI: run command has conflicting file argument and option

## Location
- **File**: [bin/cli.ts](file:///Users/williamcory/smithers/bin/cli.ts#L29-L37)
- **Lines**: 29-37

## Issue
The `run` command accepts both a positional `[file]` argument and a `-f, --file` option. This creates confusion about precedence and duplicates functionality.

## Current Code
```typescript
program
  .command("run [file]")
  .description("Run a Smithers orchestration file")
  .option("-f, --file <file>", "Orchestration file to run", ".smithers/main.tsx")
  .action(run);
```

## Suggested Fix
Remove the redundant option - keep only the positional argument:

```typescript
program
  .command("run [file]")
  .description("Run a Smithers orchestration file (default: .smithers/main.tsx)")
  .action((file) => run(file || '.smithers/main.tsx'));
```

Or if keeping both, document the precedence clearly in help text.
