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
