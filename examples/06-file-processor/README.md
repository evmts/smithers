# File Processor Example

This example demonstrates reading, transforming, and writing multiple files using Smithers.

## What It Does

1. **Reading Phase**: Uses Glob tool to find files matching a pattern
2. **Processing Phase**: Uses Claude to read and transform file content
3. **Writing Phase**: Uses File components to write processed output

## Key Concepts

### File Component

The `<File>` component writes content to disk:

```tsx
<File path="./output.txt" onWritten={() => console.log('Done!')}>
  File content here
</File>
```

### Multi-Phase State Management

Uses SolidJS Store to track progress through phases:

```tsx
const [store, setStore] = createStore({
  phase: 'reading',
})

const setPhase = (phase) => setStore('phase', phase)
```

### Tool Integration

Shows how to use built-in tools effectively:
- `Glob` - Find files by pattern
- `Read` - Read file contents
- `File` component - Write results

## Usage

```bash
# Process all markdown files in current directory
bun run examples/06-file-processor/agent.tsx "**/*.md" "./processed"

# Process specific directory
bun run examples/06-file-processor/agent.tsx "docs/**/*.md" "./output"

# Mock mode (no actual file operations)
SMITHERS_MOCK=true bun run examples/06-file-processor/agent.tsx
```

## Example Output

```
🔄 File Processor Starting
  Pattern: **/*.md
  Output: ./processed

✓ Written: ./processed/README.md
✓ Written: ./processed/SPEC.md
✓ Written: ./processed/CONTRIBUTING.md

✅ File Processing Complete
  Processed: 3 files
```

## Extending This Example

### Add Custom Transformations

Modify the processing phase to apply different transformations:

```tsx
<Claude allowedTools={['Read']}>
  For each file:
  1. Extract code blocks
  2. Add syntax highlighting
  3. Generate documentation
</Claude>
```

### Batch Processing with Rate Limiting

Use ClaudeProvider for processing many files:

```tsx
<ClaudeProvider rateLimit={{ requestsPerMinute: 50 }}>
  {files.map(file => (
    <Claude key={file}>Process {file}</Claude>
  ))}
</ClaudeProvider>
```

### Error Handling

Add error recovery for failed transformations:

```tsx
<Claude
  onError={(error) => {
    console.error(`Failed to process ${file}: ${error.message}`)
    setPhase('retry')
  }}
>
  Process file with validation
</Claude>
```

## Related Examples

- [08-test-generator](../08-test-generator) - Generates test files from source
- [11-rate-limited-batch](../11-rate-limited-batch) - Process many files with rate limiting
- [10-mcp-integration](../10-mcp-integration) - Use MCP filesystem tools