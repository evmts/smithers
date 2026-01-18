**Scope:** easy

# Stream Parsing Uses Fragile Regex

## Status: PARTIALLY ADDRESSED

## Summary
The Claude CLI output parser uses regex patterns to parse streaming output. This approach is fragile and could break if Claude's output format changes.

## Improvements Made
- Comprehensive test coverage (595 total test lines across both parsers)
- Error handling with try-catch and fallback strategies
- Documentation of expected formats in type definitions
- Default values when parsing fails
- Case-insensitive pattern matching

## Remaining Issues
Core regex-based parsing still present:
- **output-parser.ts** (L54-66): Regex for token/turn extraction from text
  - Pattern: `/tokens?:\s*(\d+)\s*input,?\s*(\d+)\s*output/i`
  - Pattern: `/turns?:\s*(\d+)/i`
- **message-parser.ts** (L21, 50, 124, 146): Regex for tool boundary detection
  - Pattern: `/^(Tool:|TOOL:|\s*<invoke)/m`
  - Pattern: `/\n\n(?=[A-Za-z\d])/` for double newline boundaries

## Impact
- Silent failures possible if CLI output format changes
- Tool boundary detection fragile (relies on newline patterns, XML tags)
- No structural guarantees from upstream CLI

## How to Fix
Based on codebase patterns:

1. **Prefer structured CLI output**
   - Already uses JSON parsing when `outputFormat: 'json'` or `'stream-json'`
   - Extend JSON format support to include token/turn metadata
   - Add structured tool-call events to stream output

2. **Add format version detection**
   ```typescript
   // Detect format version in output header
   const versionMatch = stdout.match(/^# Format: v(\d+)/)
   if (versionMatch) {
     return parseWithVersion(stdout, parseInt(versionMatch[1]))
   }
   ```

3. **Enhanced fallback chain**
   - Try JSON parse first
   - Fall back to regex patterns
   - Log warnings when using regex fallbacks
   - Emit metrics for monitoring parsing failures

4. **Integration tests with real CLI**
   - Current tests use synthetic output
   - Add tests that parse actual `claude` CLI output
   - Detect breaking changes in CI

## Location
- `/Users/williamcory/smithers/src/components/agents/claude-cli/output-parser.ts`
- `/Users/williamcory/smithers/src/components/agents/claude-cli/message-parser.ts`
- Tests: `*.test.ts` in same directory

## Priority
**P3** - Technical debt, not blocking. Good test coverage reduces risk.

## Estimated Effort
2-3 hours (reduced from 3-4 due to existing test infrastructure)
