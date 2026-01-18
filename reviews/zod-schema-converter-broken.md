# Zod Schema Converter Broken

## Status: CRITICAL BLOCKER

## Summary
The `zodToJsonSchema()` function in `src/utils/structured-output/zod-converter.ts` returns objects with missing properties, causing 18+ test failures.

## Impact
- Structured output validation is unusable
- Schema retries for Claude responses will fail
- Core feature for type-safe AI responses is broken

## Evidence
```
Test: src/utils/structured-output/zod-converter.test.ts

expect(result.type).toBe('object')
Expected: "object"
Received: undefined
```

## Location
- `src/utils/structured-output/zod-converter.ts`
- `src/utils/structured-output/zod-converter.test.ts`

## Suggested Fix
1. Review the zodToJsonSchema implementation for missing property mappings
2. Ensure all Zod types (object, string, number, array, etc.) are properly converted
3. Consider using an existing library like `zod-to-json-schema` if implementation is complex

## Priority
**P0** - Blocks MVP release

## Estimated Effort
2-3 hours
