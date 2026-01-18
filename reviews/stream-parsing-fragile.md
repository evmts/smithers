# Stream Parsing Uses Fragile Regex

## Status: LOW PRIORITY

## Summary
The Claude CLI output parser uses regex patterns to parse streaming output. This approach is fragile and could break if Claude's output format changes.

## Impact
- Parser may fail silently on format changes
- Edge cases in output may not be handled
- Debugging output parsing issues is difficult

## Location
- `src/components/agents/output-parser.ts`
- `src/components/agents/message-parser.ts`

## Suggested Fix
1. Document expected output format
2. Add more comprehensive error handling
3. Consider structured output from CLI if available
4. Add regression tests for various output formats
5. Add fallback parsing strategies

## Priority
**P3** - Technical debt, not blocking

## Estimated Effort
3-4 hours
