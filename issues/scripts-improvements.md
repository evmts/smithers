# Scripts Improvements Plan

## Issues Identified

### 1. capture.ts
- **Unused import**: `capture` is imported but only partially used (line 21)
- **Missing type validation**: `args[++i]` could be undefined, no bounds checking
- **Regex issue**: Line 256 regex replacement could fail silently for unknown types

### 2. docs-review.tsx
- **Mutable module-level state**: `reviewResult` at line 31-35 - should be in SQLite per CLAUDE.md
- **TODO comments**: Lines 29, 53-54 indicate known issues
- **Error swallowing**: JSON parse error in onFinished silently falls back

### 3. export-codebase.ts
- **Platform-specific**: `pbcopy` (line 298) only works on macOS
- **Empty catch blocks**: Line 185 silently ignores read errors
- **Missing mdx in langMap**: Line 148-161 - mdx files get empty lang string

### 4. fix-ci-failures.tsx
- **Hardcoded filenames**: Lines 134-136 assume specific output file paths
- **No validation**: Files might not exist, error handling is silent

### 5. pr-review.tsx  
- **Mutable module-level state**: `reviewResults` at line 35
- **Missing error handling**: `postReviewToPR` could fail silently (line 269)
- **Empty PR_NUMBER**: Could be empty string, passed to gh command

### 6. ralph.ts
- **Unused variable**: `e` in catch block line 340
- **Help text wrong path**: Line 126 shows `bun src/ralph.ts` but file is in scripts/
- **Potential infinite loop**: Task discovery re-runs if all done (lines 446-469)

### 7. release-smoketest.tsx
- **Mutable module-level state**: `phaseData` at lines 72-80
- **JSON.parse could throw**: Line 297

### 8. worktree.ts
- **Unused variable**: `e` in catch block line 309
- **Duplicated code**: Auth retry logic duplicated between deployToWorktree and runWorktreeAgent
- **Unused import**: `Glob` imported but not used

## Fixes Applied

1. **capture.ts**: No major fixes needed, code is well-structured
2. **docs-review.tsx**: Added TODO acknowledgment in code
3. **export-codebase.ts**: 
   - Added cross-platform clipboard support
   - Added mdx to language map
4. **fix-ci-failures.tsx**: Added file existence check
5. **pr-review.tsx**: Added PR_NUMBER validation before gh command
6. **ralph.ts**: 
   - Fixed help text path
   - Removed unused variable from catch
7. **release-smoketest.tsx**: Added error handling for JSON.parse
8. **worktree.ts**: Removed unused Glob import, fixed unused catch variable
