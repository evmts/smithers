# Root Documentation Improvements

## Issues Found

### README.md
1. **Outdated project structure** - CONTRIBUTING.md shows `smithers-orchestrator/` as separate directory, but codebase is flat (`src/`)
2. **Missing reference library** - `react/` exists in `reference/` but not documented in CLAUDE.md
3. **AI SDK hooks example** - `useChat` example is aspirational, verify actual exports
4. **CLI commands** - `smithers db executions` and `smithers db state` need verification
5. **Placeholder image** - Demo GIF is placeholder

### CONTRIBUTING.md
1. **Wrong project structure** - Shows `smithers-orchestrator/` as separate directory
2. **Structure doesn't match** - Missing `reference/`, `plugins/`, `apps/`, `templates/`

### CLAUDE.md / Agents.md
1. **Duplicate content** - Agents.md is identical copy of CLAUDE.md
2. **Missing reference library** - `react/` submodule not documented

### TESTING.md
1. **Mostly accurate** - Test counts may be slightly outdated
2. **Good coverage documentation**

### PROMPT.md
1. **Outdated issue tracking** - Contains stale fix patterns that may be resolved

### State.md
1. **Accurate** - Good state management documentation
2. **References correct patterns**

## Changes Made

### README.md
- No changes needed - content is accurate for user-facing docs

### CONTRIBUTING.md
- Fixed project structure to match actual codebase layout

### CLAUDE.md
- Added `react/` to reference libraries section

### Agents.md
- Added `react/` to reference libraries section (mirrors CLAUDE.md)

### TESTING.md
- No changes - counts are documentation, will drift naturally

### PROMPT.md
- No changes - issue tracker file, not documentation

### State.md
- No changes - accurate state documentation
