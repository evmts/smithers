# Feature Workflow Example

The flagship example demonstrating Smithers' full capabilities for production-grade feature development.

## Overview

This example implements a comprehensive development workflow that mirrors how senior engineers build features:

1. **Research** - Gather context from the codebase
2. **Plan** - Create a detailed implementation plan
3. **Validate** - Build a POC to test assumptions
4. **Refine** - Update the plan based on learnings
5. **Implement** - Build it right with TDD

## Workflow Phases

```
prompt-input → research → planning → plan-review (Human)
     ↓
    poc → poc-analysis (Deep Thinking) → refined-review (Human)
     ↓
 api-impl → test-impl → test-verify → implementation → done
```

### Phase Details

| Phase | Description |
|-------|-------------|
| `prompt-input` | Human confirms the feature request |
| `research` | Agent searches files, docs, and codebase for context |
| `planning` | Agent creates implementation plan with test cases |
| `plan-review` | Human reviews and approves/rejects the plan |
| `poc` | Agent builds a quick proof of concept |
| `poc-analysis` | Deep analysis (extended thinking) of POC learnings |
| `refined-review` | Human reviews the improved, detailed plan |
| `api-impl` | Implement types, interfaces, JSDoc (throw not implemented) |
| `test-impl` | Write comprehensive tests |
| `test-verify` | Verify tests fail (TDD red phase) |
| `implementation` | Implement actual code to make tests pass |
| `done` | Complete |

## Key Concepts Demonstrated

### 1. Human-in-the-Loop Approval

Multiple checkpoints where humans can approve, reject, or modify:

```tsx
<Human
  message="Review the implementation plan"
  onApprove={() => nextPhase()}
  onReject={() => setPhase('cancelled')}
>
  {planDetails}
</Human>
```

### 2. Extended Thinking for Deep Analysis

The POC analysis phase uses extended thinking tokens:

```tsx
<Claude maxThinkingTokens={16000}>
  <Phase name="poc-analysis">
    <Step>Analyze POC discoveries deeply</Step>
    ...
  </Phase>
</Claude>
```

### 3. Test-Driven Development Flow

The workflow enforces TDD:

1. **API Implementation**: Types and JSDoc only, all functions throw "Not implemented"
2. **Test Implementation**: Write tests that call the not-yet-implemented code
3. **Test Verification**: Verify tests fail with "Not implemented" errors
4. **Implementation**: Replace stubs with real code until tests pass

### 4. POC-Driven Refinement

Build something quick to learn, then refine the plan:

```
Initial Plan → POC → Discoveries → Refined Plan (better APIs, more tests, etc.)
```

### 5. SolidJS State Management

Complex state flows through 12 phases using SolidJS Stores:

```tsx
const [store, setStore] = createStore<WorkflowState>({
  phase: 'prompt-input',
  fileResearch: [],
  initialPlan: null,
  refinedPlan: null,
  // ... many more fields
})

const actions = {
  nextPhase: () => {
    const currentIndex = phaseOrder.indexOf(store.phase)
    setStore('phase', phaseOrder[currentIndex + 1])
  },
}
```

## Usage

### As a CLI

```bash
bun run examples/00-feature-workflow/agent.tsx "Add user authentication"
```

### As a Module

```tsx
import FeatureWorkflow, { workflowStore } from './agent.tsx'
import { executePlan } from '@evmts/smithers'

await executePlan(
  FeatureWorkflow,
  {
    onHumanPrompt: async (message, content) => {
      // Show UI for human approval
      return await showApprovalDialog(message, content)
    },
  }
)

// Access final state
console.log(workflowStore.refinedPlan)
```

## Customization

### Skip POC Phase

For simpler features, you can modify the phase order:

```tsx
const phaseOrder = [
  'prompt-input',
  'research',
  'planning',
  'plan-review',
  // Skip POC phases
  'api-impl',
  'test-impl',
  'test-verify',
  'implementation',
  'done',
]
```

### Add Custom Phases

Add domain-specific phases like security review or documentation:

```tsx
case 'security-review':
  return (
    <Claude>
      <Persona role="security engineer">
        Review the implementation for security vulnerabilities.
      </Persona>
      ...
    </Claude>
  )
```

## Why This Workflow?

This workflow is designed for building **robust, production-quality features**:

- **Research first** prevents building on wrong assumptions
- **Human checkpoints** catch issues early
- **POC validation** discovers unknowns before committing to a plan
- **TDD flow** ensures testable, well-designed code
- **Extended thinking** enables deep analysis of complex problems

It's the workflow you'd use for building a SolidJS framework.