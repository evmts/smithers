# Large e2e TODO backlog in evals
Priority: HIGH

## Evidence
- Large `test.todo` blocks in eval suites:
  - `evals/10-vcs-git.test.tsx`
  - `evals/11-vcs-jj.test.tsx`
  - `evals/12-mcp-integration.test.tsx`
  - `evals/13-composition-advanced.test.tsx`

## Problem
- Critical integration scenarios are documented but unimplemented, leaving gaps in the e2e safety net.

## Impact
- E2E regressions (VCS operations, MCP lifecycle, composition edge cases) can pass CI/CD without detection.

## Recommendation
- Prioritize converting TODOs into executable tests, starting with:
  - Git/JJ commit/notes status transitions and error modes.
  - MCP Sqlite tool lifecycle + permissions.
  - Composition depth/width stress + key stability.
- Track a burn-down list and gate releases on a minimal critical subset.

## References
- `evals/10-vcs-git.test.tsx`
- `evals/11-vcs-jj.test.tsx`
- `evals/12-mcp-integration.test.tsx`
- `evals/13-composition-advanced.test.tsx`
