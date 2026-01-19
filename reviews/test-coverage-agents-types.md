# Test Coverage Gap: Agent Types

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/components/agents/types/agents.ts` | - | Low |
| `src/components/agents/types/execution.ts` | - | Low |
| `src/components/agents/types/schema.ts` | - | Low-Medium |
| `src/components/agents/types/tools.ts` | - | Low |
| `src/components/agents/ClaudeCodeCLI.ts` | 20 | Low (re-exports only) |

## What Should Be Tested

### Type Definitions
Generally type files don't need tests, but if they contain:
- Runtime validation functions
- Type guards (`isXxx` functions)
- Schema definitions with validation

### schema.ts (if it has Zod schemas)
- Schema validation passes for valid input
- Schema validation fails for invalid input
- Error messages are descriptive

## Priority

**LOW** - Type files are mostly compile-time constructs. Only test if runtime behavior exists.

## Notes

- ClaudeCodeCLI.ts is pure re-exports - tested via claude-cli module tests
- Focus testing efforts on implementation files, not type definitions
