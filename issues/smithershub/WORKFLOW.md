# SmithersHub Implementation Workflow

## Overview

Ralph loop that uses round-robin agents (Codex/Claude) to implement SmithersHub incrementally.

## Core Loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. READ: PRD.md, ENGINEERING.md, DESIGN.md, current implementation     │
│  2. PLAN: Decide next single task (TDD approach)                        │
│  3. IMPLEMENT: Round-robin Codex/Claude executes task                   │
│  4. REVIEW: Gemini, Claude, Codex all review                            │
│  5. RESPOND: Address review feedback until 3x LGTM                      │
│  6. COMMIT: JJ commit, verify clean repo                                │
│  7. WAIT: 10 second timeout                                             │
│  8. LOOP                                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Agent Roles

| Agent | Role |
|-------|------|
| Codex | Planning, implementation (non-design) |
| Claude | Implementation (non-design), reviewing |
| Gemini | Design work (CSS, HTML, JSX), reviewing |

## Delegation Rules

- **Design-focused work** (CSS, HTML, JSX) → Gemini
- **Everything else** → Round-robin Codex/Claude
- Agents invoked as tool calls (not CLI)

## Testing Strategy

| Type | Coverage | Priority |
|------|----------|----------|
| E2E (Playwright) | High | Highest |
| Integration | High | High |
| Unit | ~100% | Required |

Features implemented end-to-end with tests at all levels.

## Structured Output

Agent returns structured response to trigger:
- Execute another agent with specific prompt
- Callbacks on nodes
- Dynamic phase/step transitions

**Not hardcoded phases.** Pass as XML context, agent decides flow.

## New Features Required

1. **Agent-as-tool-call** — Invoke Gemini/Claude/Codex as tool
2. **JJ snapshot on tool calls** — Wrap Claude, snapshot every change
3. **Dynamic phases via XML** — No hardcoded phases, agent-driven
4. **Clean repo check** — Verify repo clean after commit
5. **Round-robin executor** — Alternate between agents
6. **Timeout between iterations** — 10 second throttle

## Implementation Order

1. Design agent-as-tool-call pattern
2. Design JJ snapshotting integration
3. Design dynamic phase XML format
4. Implement core Ralph loop
5. Add review phase
6. Add delegation logic
7. Add testing infrastructure
