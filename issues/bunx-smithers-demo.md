# bunx smithers-orchestrator demo

<metadata>
  <priority>P1</priority>
  <category>tooling</category>
  <status>proposed</status>
  <dependencies></dependencies>
  <blocked-by></blocked-by>
  <docs>["docs/introduction.mdx"]</docs>
</metadata>

## Executive Summary

**What**: Create an interactive demo that runs via `bunx smithers-orchestrator demo`

**Why**: Get users to the "aha moment" faster than reading docs. No install step needed.

**Impact**: Users can experience Smithers in seconds, not minutes.

## Problem Statement

Current onboarding requires:
1. Reading docs
2. Installing package
3. Writing boilerplate
4. Running code

This is too slow. Users should feel the power of Smithers immediately.

## Proposed Solution

### Architecture

```
bunx smithers-orchestrator demo
        │
        ▼
┌─────────────────────────┐
│ Copy SmithersDemo.tsx   │
│ to current directory    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Interactive walkthrough │
│ that teaches Smithers   │
└─────────────────────────┘
```

### Key Design Decisions

1. **Decision**: Copy a file rather than run in-memory
   - **Rationale**: Users can read, modify, and learn from the file
   - **Alternatives Considered**: REPL, in-memory execution

2. **Decision**: Interactive guided experience
   - **Rationale**: Teaches concepts step-by-step, not just "run and done"

### Behavior

```bash
$ bunx smithers-orchestrator demo

🎩 Welcome to Smithers!

Creating SmithersDemo.tsx...

This demo will guide you through:
  1. Creating your first agent
  2. Using phases and steps
  3. Structured output with schemas
  4. Persistence and state

Run it with: bun SmithersDemo.tsx

[Press Enter to continue...]
```

## Implementation Plan

### Phase 1: CLI Command

**Files to Create:**
- `src/cli/demo.ts` - Demo command handler
- `templates/SmithersDemo.tsx` - Template file to copy

**Files to Modify:**
- `src/cli/index.ts` - Register demo command

### Phase 2: Interactive Walkthrough

The demo file should:
- Be self-documenting with comments
- Run incrementally (pause between sections)
- Show output at each step
- Teach: Claude, Phase, Step, Parallel, schema, db.state

## Acceptance Criteria

- [ ] `bunx smithers-orchestrator demo` works without prior install
- [ ] Creates SmithersDemo.tsx in current directory
- [ ] Demo is interactive and educational
- [ ] Demo completes in under 2 minutes
- [ ] Demo teaches core concepts: agents, phases, structured output

## References

- [Introduction docs](../docs/introduction.mdx)
- Similar: `bunx create-next-app`, `bunx degit`
