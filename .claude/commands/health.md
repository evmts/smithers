---
allowed-tools: Bash(bun *:*), Bash(git *:*)
argument-hint: [--fix]
description: Run all repo checks (build, test, lint) and fix issues
model: claude-sonnet-4-5-20250929
---

# Repository Health Check

Run comprehensive checks on the repository and fix any issues found.

## Execution Order

1. **Typecheck**
   ```sh
   bun run typecheck
   ```
   - Fix type errors if found and --fix in $ARGUMENTS
   - Report all type issues clearly

2. **Lint**
   ```sh
   bun run lint
   ```
   - Auto-fix with `bun run lint --fix` if --fix in $ARGUMENTS
   - Report remaining linting issues

3. **Tests**
   ```sh
   bun test
   ```
   - Fix failing tests if --fix in $ARGUMENTS
   - Report test failures with context

4. **Build**
   ```sh
   bun run build
   ```
   - Fix build errors if found and --fix in $ARGUMENTS
   - Confirm successful build

## Fix Protocol

If `--fix` is in $ARGUMENTS:
- Automatically fix type errors, linting issues, failing tests, and build failures
- Create atomic commits for each category of fixes
- Use appropriate commit messages (e.g., "🐛 fix: resolve type errors in registry")

If `--fix` is NOT in $ARGUMENTS:
- Report all issues found
- Do NOT make any changes
- Provide summary of health status

## Reporting

Provide concise summary:

```
┌─────────────────────────────────────┐
│ REPOSITORY HEALTH CHECK             │
├─────────────────────────────────────┤
│ ✓ Typecheck: PASS                   │
│ ✓ Lint: PASS                        │
│ ✗ Tests: 3 failing                  │
│ ✓ Build: PASS                       │
└─────────────────────────────────────┘

Issues found:
- tests: foo.test.ts - expected X got Y
- tests: bar.test.ts - timeout exceeded
```

## Validation

After fixing issues:
- Re-run all checks to confirm fixes worked
- Report final status
- Commit fixes following Git Commit Protocol in CLAUDE.md

Arguments: $ARGUMENTS
