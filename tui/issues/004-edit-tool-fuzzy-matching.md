# Edit Tool Fuzzy Matching

## Priority: High

## Problem
Current `edit_file` requires exact string match. LLM-generated `old_str` often has:
- Different whitespace (trailing spaces, tabs vs spaces)
- Different line endings (LF vs CRLF)
- Missing/extra blank lines

## Pi Implementation
- `packages/coding-agent/src/core/tools/edit-diff.ts`
- `fuzzyFindText()` - tries exact match first, falls back to fuzzy
- `normalizeForFuzzyMatch()` - collapse whitespace for matching
- BOM stripping before match
- Line ending detection and preservation

## Fuzzy Matching Algorithm

```
1. Try exact match first
2. If no match:
   a. Normalize both strings (collapse whitespace)
   b. Find match in normalized content
   c. Map back to original positions
3. Verify single occurrence (reject ambiguous)
```

## Additional Features to Port

1. **BOM handling**: Strip UTF-8 BOM before matching, restore after
2. **Line ending preservation**: Detect CRLF/LF, normalize for match, restore original
3. **Diff generation**: Return unified diff with first changed line number
4. **Occurrence counting**: Error if multiple matches found

## Implementation Plan

1. Add `edit-diff.zig` with:
   ```zig
   pub fn fuzzyFindText(content: []const u8, needle: []const u8) ?Match
   pub fn normalizeForFuzzyMatch(text: []const u8) []const u8
   pub fn detectLineEnding(text: []const u8) LineEnding
   pub fn generateDiff(old: []const u8, new: []const u8) Diff
   ```

2. Update `edit_file.zig` to use fuzzy matching

3. Add diff to tool result details

4. Update chat display to show diff

## Reference Files
- `reference/pi-mono/packages/coding-agent/src/core/tools/edit-diff.ts`
- `reference/pi-mono/packages/coding-agent/src/core/tools/edit.ts`
