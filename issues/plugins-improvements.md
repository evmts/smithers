# Plugin System Improvements

<metadata>
  <priority>medium</priority>
  <category>refactor</category>
  <status>in-progress</status>
</metadata>

---

## Issues Found

### 1. hooks/capture-prompt.ts - Silent Error Swallowing
**Location:** Line 53-56
**Issue:** Empty catch block silently swallows all errors without any logging
**Risk:** Debugging issues becomes impossible; DB failures go unnoticed

### 2. hooks/ralph-check.ts - Silent Error Swallowing  
**Location:** Line 77
**Issue:** Empty catch block silently swallows all errors
**Risk:** Same as above - hard to debug

### 3. hooks/ralph-check.ts - Unreliable File Deletion
**Location:** Line 67-68
**Issue:** Uses `Bun.file().delete?.()` with optional chaining - method may not exist, and fallback creates `.done` file as workaround
**Risk:** Inconsistent behavior across Bun versions

### 4. hooks/hooks.json - Schema Validation Missing
**Issue:** No type validation for hook configuration; malformed JSON silently fails
**Risk:** Runtime errors from misconfigured hooks

### 5. Missing Test Coverage
**Issue:** No test files in `plugins/smithers/**/*.test.ts`
**Components needing tests:**
- `capture-prompt.ts` - prompt capture logic
- `ralph-check.ts` - ralph mode triggering
- `capture.ts` utility functions

### 6. capture.ts - Type Override Logic Fragile
**Location:** scripts/capture.ts lines 253-265
**Issue:** Regex replace on filePath is fragile; doesn't re-generate content for forced type
**Risk:** Wrong template used when type is overridden

### 7. Skills Reference Missing Scripts
**Issue:** `skills/capture/SKILL.md` references `scripts/capture.ts` and `src/utils/capture.ts` but those aren't part of the plugin directory
**Risk:** Skills may break if deployed independently

---

## Fixes Applied

### 1. ✅ Add Debug Logging to Hooks
Replace silent catch blocks with conditional debug logging using `process.env.DEBUG`

### 2. ✅ Fix File Deletion in ralph-check.ts
Use `Bun.$` to remove file reliably instead of optional chaining

### 3. ✅ Improve Type Override Logic
Re-generate capture content when type is explicitly overridden

### 4. ✅ Add Hook Interface Types
Create shared types for hook input/output contracts

---

## Verification

- [x] `bunx tsc --noEmit` passes
- [x] Changes committed
