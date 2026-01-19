# PR #5 Review: Easy Fixes

**PR:** issue/easy-fixes
**Status:** Request Changes

---

## Summary

Bundles multiple unrelated changes:
1. PROMPT.md with fix instructions
2. `/capture` skill implementation
3. Code review documents
4. Capture utility (`scripts/capture.ts`, `src/utils/capture.ts`)

## Critical Issues

### 1. Scope Creep
PR titled "easy-fixes" but contains significant new feature (`/capture` skill) that should be a separate PR. The actual "easy fixes" listed in PROMPT.md are NOT implemented in this PR.

**Expected:** Quick 1-5 line fixes for:
- Task componentName misuse
- Smithers prompt string weakness
- Limited error context
- Missing host config fields
- License header correction

**Actual:** None of these fixes are present. PR adds new capture functionality instead.

### 2. PROMPT.md Checked In
`PROMPT.md` is a working document for agents, not meant to be committed. Should be gitignored or removed before merge.

### 3. Capture Skill Not in Issue
The `/capture` skill was not specified in any `issues/*.md` file. Implementing untracked features bypasses review process.

## Positive

- Capture utility implementation looks reasonable
- Scripts follow existing patterns
- Review documents provide useful context

## Verdict

**REQUEST CHANGES** - PR needs to be split:
1. PR for actual easy fixes (as specified in PROMPT.md)
2. Separate PR for capture skill (with corresponding issue)

---

## Action Items
- [ ] Remove PROMPT.md from commit
- [ ] Create `issues/capture-skill.md` for new feature
- [ ] Split PR: one for fixes, one for capture
- [ ] Actually implement the easy fixes listed

---

## Debugging Plan

### Files to Investigate
- `/Users/williamcory/smithers/PROMPT.md` - still committed, should be gitignored
- `/Users/williamcory/smithers/.gitignore` - missing PROMPT.md entry
- `/Users/williamcory/smithers/scripts/capture.ts` - feature without issue tracking
- `/Users/williamcory/smithers/src/utils/capture.ts` - feature without issue tracking
- `/Users/williamcory/smithers/issues/` - no capture-skill.md exists

### Grep Patterns
```bash
# Check if PROMPT.md is tracked
git ls-files | grep -i prompt

# Find easy fixes mentioned but not implemented
grep -r "componentName" src/ --include="*.ts"
grep -r "host config" src/ --include="*.ts"
grep -r "License" src/ --include="*.ts" | head -5
```

### Test Commands
```bash
# Verify branch state
git diff main..issue/easy-fixes --stat

# Check what should have been fixed
cat PROMPT.md
```

### Proposed Fix Approach
1. Add `PROMPT.md` to `.gitignore`
2. Remove `PROMPT.md` from git tracking: `git rm --cached PROMPT.md`
3. Create `issues/capture-skill.md` documenting the capture feature
4. Split PR:
   - New branch for capture feature only
   - Keep `issue/easy-fixes` for actual easy fixes from original PROMPT.md
5. Rebase/amend commits to separate concerns

---

## Status Check: 2026-01-18

**STILL RELEVANT** - Issues persist:

| Issue | Status |
|-------|--------|
| PROMPT.md tracked in git | ❌ Still tracked (not in .gitignore) |
| issues/capture-skill.md missing | ❌ Does not exist |
| capture.ts files without issue | ❌ Still present at scripts/ and src/utils/ |
| Branch issue/easy-fixes exists | ⚠️ Branch still active |

### Immediate Actions Required
1. `echo "PROMPT.md" >> .gitignore && git rm --cached PROMPT.md`
2. Create `issues/capture-skill.md` with feature spec
3. Decide: merge capture as-is or split PR
