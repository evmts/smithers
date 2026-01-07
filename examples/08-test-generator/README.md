# Test Generator Example

This example demonstrates automated test generation from source code using Smithers.

## What It Does

1. **Analyze Phase**: Reads source file and extracts exports (functions, classes)
2. **Generate Phase**: Creates comprehensive tests using specified framework
3. **Write Phase**: Writes test file alongside source

## Key Concepts

### OutputFormat Component

Uses `<OutputFormat>` to get structured data from Claude:

```tsx
<OutputFormat schema={analysisSchema}>
  Analyze this file and return JSON with functions, classes, exports
</OutputFormat>
```

Schema ensures consistent, parseable responses.

### Multi-Phase Code Generation

1. Understand code structure (analyze)
2. Generate tests based on understanding
3. Write output to filesystem

### Framework Support

Generates tests for multiple testing frameworks:
- **Bun** - Native Bun test runner
- **Jest** - Popular Jest framework
- **Vitest** - Fast Vite-native testing

## Usage

### Generate Bun Tests (Default)

```bash
bun run examples/08-test-generator/agent.tsx src/utils/math.ts
```

Creates `src/utils/math.test.ts` with Bun test syntax.

### Generate Jest Tests

```bash
bun run examples/08-test-generator/agent.tsx src/utils/math.ts jest
```

### Generate Vitest Tests

```bash
bun run examples/08-test-generator/agent.tsx src/utils/math.ts vitest
```

## Example Output

Given source file `math.ts`:

```typescript
export function add(a: number, b: number): number {
  return a + b
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
```

Generated `math.test.ts`:

```typescript
import { test, expect } from 'bun:test'
import { add, divide } from './math'

test('add - happy path', () => {
  expect(add(2, 3)).toBe(5)
})

test('add - negative numbers', () => {
  expect(add(-2, -3)).toBe(-5)
})

test('divide - happy path', () => {
  expect(divide(10, 2)).toBe(5)
})

test('divide - throws on division by zero', () => {
  expect(() => divide(10, 0)).toThrow('Division by zero')
})
```

## Generated Test Quality

The agent generates tests that cover:

✅ **Happy paths** - Normal usage scenarios
✅ **Edge cases** - Boundary conditions, empty inputs
✅ **Error cases** - Expected failures and throws
✅ **Type safety** - TypeScript edge cases

## Extending This Example

### Add Coverage Analysis

Check existing test coverage before generating:

```tsx
<Claude allowedTools={['Bash']}>
  Run: bun test --coverage
  Identify untested functions in {sourceFile}
  Generate tests ONLY for untested code
</Claude>
```

### Add Interactive Selection

Let user choose what to test:

```tsx
<Human
  message="Which functions should I test?"
  onApprove={(selected) => setFunctions(selected)}
>
  Available functions:
  {analysis.functions.map(f => `\n- ${f}`).join('')}
</Human>
```

### Generate Integration Tests

```tsx
<Claude>
  Generate integration tests that:
  1. Set up test database
  2. Test API endpoints
  3. Verify database state
  4. Clean up after tests
</Claude>
```

### Add Snapshot Testing

```tsx
<Claude>
  Generate snapshot tests for:
  - React component rendering
  - API response structures
  - Generated file outputs
</Claude>
```

## Best Practices

### 1. Review Generated Tests

Always review generated tests before using them:

```bash
# Generate tests
bun run examples/08-test-generator/agent.tsx src/math.ts

# Review the output
cat src/math.test.ts

# Run tests to verify
bun test src/math.test.ts
```

### 2. Iterative Refinement

If tests aren't quite right, add more context:

```tsx
<Claude>
  Generate tests for {sourceFile}

  Additional context:
  - This function uses external API
  - Mock the API calls
  - Test retry logic
</Claude>
```

### 3. Test the Tests

Generated tests should fail when code is broken:

```bash
# Temporarily break code
# Run tests - should fail
# Fix code
# Tests should pass
```

## Related Examples

- [02-code-review](../02-code-review) - Automated code review
- [00-feature-workflow](../00-feature-workflow) - TDD workflow with test generation
- [06-file-processor](../06-file-processor) - File transformation pipeline
