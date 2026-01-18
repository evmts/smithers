# Smithers Orchestration Examples

Complete working examples demonstrating various Smithers patterns.

## Example 1: Simple Sequential Workflow

A basic three-phase workflow that executes sequentially.

```tsx
/**
 * Simple Sequential Workflow
 *
 * Phases:
 * 1. Research - Gather information
 * 2. Implement - Build solution
 * 3. Test - Verify implementation
 *
 * Max iterations: 3
 */

import { Ralph, Claude, Phase } from "smithers";
import { create } from "zustand";

interface WorkflowState {
  phase: string;
  setPhase: (phase: string) => void;
}

const useStore = create<WorkflowState>((set) => ({
  phase: "research",
  setPhase: (phase) => set({ phase }),
}));

export default function SequentialWorkflow() {
  const { phase, setPhase } = useStore();

  return (
    <Ralph maxIterations={3}>
      {phase === "research" && (
        <Phase name="Research">
          <Claude
            model="sonnet"
            onFinished={() => {
              console.log("Research phase complete");
              setPhase("implement");
            }}
          >
            Research best practices for building a REST API with Node.js. Focus
            on security, performance, and scalability.
          </Claude>
        </Phase>
      )}

      {phase === "implement" && (
        <Phase name="Implementation">
          <Claude
            model="sonnet"
            onFinished={() => {
              console.log("Implementation phase complete");
              setPhase("test");
            }}
          >
            Implement a REST API based on the research findings. Include proper
            error handling and validation.
          </Claude>
        </Phase>
      )}

      {phase === "test" && (
        <Phase name="Testing">
          <Claude
            model="sonnet"
            onFinished={() => {
              console.log("Testing phase complete");
              setPhase("done");
            }}
          >
            Write comprehensive tests for the API. Verify all endpoints work
            correctly.
          </Claude>
        </Phase>
      )}

      {phase === "done" && (
        <Phase name="Complete">
          <div>✅ Workflow complete!</div>
        </Phase>
      )}
    </Ralph>
  );
}
```

---

## Example 2: Conditional Branching

Workflow that branches based on validation results.

```tsx
/**
 * Conditional Branching Workflow
 *
 * Phases:
 * 1. Analyze - Assess the codebase
 * 2a. Fix Issues - If problems found
 * 2b. Optimize - If no problems found
 * 3. Verify - Confirm success
 *
 * Max iterations: 5
 */

import { Ralph, Claude, Phase } from "smithers";
import { create } from "zustand";

interface WorkflowState {
  phase: string;
  hasIssues: boolean;
  setPhase: (phase: string) => void;
  setHasIssues: (hasIssues: boolean) => void;
}

const useStore = create<WorkflowState>((set) => ({
  phase: "analyze",
  hasIssues: false,
  setPhase: (phase) => set({ phase }),
  setHasIssues: (hasIssues) => set({ hasIssues }),
}));

export default function ConditionalWorkflow() {
  const { phase, hasIssues, setPhase, setHasIssues } = useStore();

  return (
    <Ralph maxIterations={5}>
      {phase === "analyze" && (
        <Phase name="Analysis">
          <Claude
            model="opus"
            onFinished={(result: any) => {
              const foundIssues = result.issues?.length > 0;
              setHasIssues(foundIssues);

              if (foundIssues) {
                console.log("Issues found, moving to fix phase");
                setPhase("fix");
              } else {
                console.log("No issues, moving to optimize phase");
                setPhase("optimize");
              }
            }}
          >
            Analyze the codebase in src/ for potential issues: - Security
            vulnerabilities - Performance problems - Code quality issues Return
            a JSON object with an "issues" array.
          </Claude>
        </Phase>
      )}

      {phase === "fix" && (
        <Phase name="Fix Issues">
          <Claude
            model="sonnet"
            onFinished={() => {
              console.log("Issues fixed, moving to verify");
              setPhase("verify");
            }}
          >
            Fix the issues identified in the analysis phase. Make sure to test
            each fix.
          </Claude>
        </Phase>
      )}

      {phase === "optimize" && (
        <Phase name="Optimize">
          <Claude
            model="sonnet"
            onFinished={() => {
              console.log("Optimization complete, moving to verify");
              setPhase("verify");
            }}
          >
            The codebase looks good! Apply performance optimizations: - Bundle
            size reduction - Lazy loading - Caching strategies
          </Claude>
        </Phase>
      )}

      {phase === "verify" && (
        <Phase name="Verification">
          <Claude
            model="sonnet"
            validate={async (result: any) => {
              return result.all_tests_passing === true;
            }}
            onFinished={() => {
              console.log("Verification successful");
              setPhase("done");
            }}
            onError={(error) => {
              console.error("Verification failed, retrying fixes");
              setPhase("fix");
            }}
          >
            Run all tests and verify the {hasIssues ? "fixes" : "optimizations"}{" "}
            work correctly. Return JSON with "all_tests_passing" boolean.
          </Claude>
        </Phase>
      )}

      {phase === "done" && (
        <Phase name="Complete">
          <div>
            ✅ Workflow complete!{" "}
            {hasIssues ? "Issues fixed" : "Code optimized"}
          </div>
        </Phase>
      )}
    </Ralph>
  );
}
```

---

## Example 3: Parallel Execution

Multiple agents working in parallel within a phase.

```tsx
/**
 * Parallel Execution Workflow
 *
 * Phases:
 * 1. Setup - Initialize parallel workers
 * 2. Parallel Work - Multiple agents running simultaneously
 * 3. Consolidate - Merge results
 *
 * Max iterations: 3
 */

import { Ralph, Claude, Phase, Step } from "smithers";
import { create } from "zustand";

interface WorkflowState {
  phase: string;
  completedTasks: number;
  results: Record<string, any>;
  setPhase: (phase: string) => void;
  incrementCompleted: () => void;
  setResult: (task: string, result: any) => void;
}

const useStore = create<WorkflowState>((set) => ({
  phase: "setup",
  completedTasks: 0,
  results: {},

  setPhase: (phase) => set({ phase }),

  incrementCompleted: () =>
    set((state) => ({
      completedTasks: state.completedTasks + 1,
    })),

  setResult: (task, result) =>
    set((state) => ({
      results: { ...state.results, [task]: result },
    })),
}));

export default function ParallelWorkflow() {
  const {
    phase,
    completedTasks,
    results,
    setPhase,
    incrementCompleted,
    setResult,
  } = useStore();

  // When all 3 tasks complete, move to consolidate phase
  if (phase === "parallel" && completedTasks === 3) {
    setPhase("consolidate");
  }

  return (
    <Ralph maxIterations={3}>
      {phase === "setup" && (
        <Phase name="Setup">
          <Claude
            onFinished={() => {
              console.log("Setup complete, starting parallel work");
              setPhase("parallel");
            }}
          >
            Initialize the environment for parallel task execution. Verify all
            dependencies are available.
          </Claude>
        </Phase>
      )}

      {phase === "parallel" && (
        <Phase name="Parallel Execution">
          <Step name="Frontend">
            <Claude
              model="sonnet"
              onFinished={(result) => {
                console.log("Frontend task complete");
                setResult("frontend", result);
                incrementCompleted();
              }}
            >
              Build the frontend components: - User dashboard - Login form -
              Navigation
            </Claude>
          </Step>

          <Step name="Backend">
            <Claude
              model="sonnet"
              onFinished={(result) => {
                console.log("Backend task complete");
                setResult("backend", result);
                incrementCompleted();
              }}
            >
              Build the backend API: - Authentication endpoints - User
              management - Data validation
            </Claude>
          </Step>

          <Step name="Database">
            <Claude
              model="sonnet"
              onFinished={(result) => {
                console.log("Database task complete");
                setResult("database", result);
                incrementCompleted();
              }}
            >
              Set up the database: - Schema design - Migrations - Seed data
            </Claude>
          </Step>
        </Phase>
      )}

      {phase === "consolidate" && (
        <Phase name="Consolidation">
          <Claude
            model="opus"
            onFinished={() => {
              console.log("Consolidation complete");
              setPhase("done");
            }}
          >
            Review and integrate the results from all three parallel tasks:
            Frontend: {JSON.stringify(results.frontend)}
            Backend: {JSON.stringify(results.backend)}
            Database: {JSON.stringify(results.database)}
            Ensure everything works together correctly.
          </Claude>
        </Phase>
      )}

      {phase === "done" && (
        <Phase name="Complete">
          <div>✅ All parallel tasks complete and consolidated!</div>
        </Phase>
      )}
    </Ralph>
  );
}
```

---

## Example 4: Error Handling and Retry

Robust error handling with automatic retry logic.

```tsx
/**
 * Error Handling and Retry Workflow
 *
 * Phases:
 * 1. Attempt - Try the task
 * 2. Retry - If failed and retries remaining
 * 3. Recovery - If all retries exhausted
 * 4. Success - If any attempt succeeds
 *
 * Max iterations: 5 (3 retries + recovery + success)
 */

import { Ralph, Claude, Phase } from "smithers";
import { create } from "zustand";

interface WorkflowState {
  phase: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  setPhase: (phase: string) => void;
  incrementRetry: () => void;
  setLastError: (error: string) => void;
}

const useStore = create<WorkflowState>((set) => ({
  phase: "attempt",
  retryCount: 0,
  maxRetries: 3,
  lastError: null,

  setPhase: (phase) => set({ phase }),
  incrementRetry: () => set((state) => ({ retryCount: state.retryCount + 1 })),
  setLastError: (error) => set({ lastError: error }),
}));

export default function ErrorHandlingWorkflow() {
  const {
    phase,
    retryCount,
    maxRetries,
    lastError,
    setPhase,
    incrementRetry,
    setLastError,
  } = useStore();

  return (
    <Ralph maxIterations={5}>
      {phase === "attempt" && (
        <Phase name={`Attempt ${retryCount + 1}`}>
          <Claude
            model="sonnet"
            validate={async (result: any) => {
              // Simulate validation that might fail
              return result.success === true && result.tests_passing === true;
            }}
            onFinished={() => {
              console.log("Task succeeded!");
              setPhase("success");
            }}
            onError={(error) => {
              console.error(`Attempt ${retryCount + 1} failed:`, error.message);
              setLastError(error.message);

              if (retryCount < maxRetries) {
                console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
                incrementRetry();
                setPhase("attempt");
              } else {
                console.log("All retries exhausted, moving to recovery");
                setPhase("recovery");
              }
            }}
          >
            Perform a critical task that might fail: - Connect to external API -
            Process data - Validate results Return JSON with: - success: boolean
            - tests_passing: boolean - data: any results
          </Claude>
        </Phase>
      )}

      {phase === "recovery" && (
        <Phase name="Recovery">
          <Claude
            model="opus"
            onFinished={() => {
              console.log("Recovery complete");
              setPhase("done");
            }}
          >
            The task failed after {maxRetries} attempts. Last error: {lastError}
            Implement a recovery strategy: 1. Use fallback data source 2. Apply
            default configuration 3. Document the issue for manual review
          </Claude>
        </Phase>
      )}

      {phase === "success" && (
        <Phase name="Success">
          <div>
            ✅ Task completed successfully after {retryCount + 1} attempt(s)!
          </div>
        </Phase>
      )}

      {phase === "done" && (
        <Phase name="Complete">
          <div>
            ⚠️ Task completed with recovery after {maxRetries} failed attempts
          </div>
        </Phase>
      )}
    </Ralph>
  );
}
```

---

## Example 5: Data Flow Between Phases

Complex workflow with data passing between phases.

```tsx
/**
 * Data Flow Workflow
 *
 * Phases:
 * 1. Research - Gather requirements
 * 2. Design - Create architecture based on requirements
 * 3. Implement - Build based on design
 * 4. Test - Verify against original requirements
 *
 * Max iterations: 4
 */

import { Ralph, Claude, Phase } from "smithers";
import { create } from "zustand";

interface Requirements {
  features: string[];
  constraints: string[];
  performance: string[];
}

interface Design {
  architecture: string;
  components: string[];
  dependencies: string[];
}

interface Implementation {
  files: string[];
  tests: string[];
  documentation: string;
}

interface WorkflowState {
  phase: string;
  requirements: Requirements | null;
  design: Design | null;
  implementation: Implementation | null;

  setPhase: (phase: string) => void;
  setRequirements: (reqs: Requirements) => void;
  setDesign: (design: Design) => void;
  setImplementation: (impl: Implementation) => void;
}

const useStore = create<WorkflowState>((set) => ({
  phase: "research",
  requirements: null,
  design: null,
  implementation: null,

  setPhase: (phase) => set({ phase }),
  setRequirements: (reqs) => set({ requirements: reqs }),
  setDesign: (design) => set({ design }),
  setImplementation: (impl) => set({ implementation: impl }),
}));

export default function DataFlowWorkflow() {
  const {
    phase,
    requirements,
    design,
    implementation,
    setPhase,
    setRequirements,
    setDesign,
    setImplementation,
  } = useStore();

  return (
    <Ralph maxIterations={4}>
      {phase === "research" && (
        <Phase name="Requirements Research">
          <Claude
            model="opus"
            onFinished={(result: any) => {
              console.log("Requirements gathered:", result);
              setRequirements(result);
              setPhase("design");
            }}
          >
            Gather requirements for building a task management system: 1. What
            features are needed? 2. What are the constraints (budget, timeline)?
            3. What are the performance requirements? Return JSON with:
            features[], constraints[], performance[]
          </Claude>
        </Phase>
      )}

      {phase === "design" && requirements && (
        <Phase name="Architecture Design">
          <Claude
            model="opus"
            onFinished={(result: any) => {
              console.log("Design complete:", result);
              setDesign(result);
              setPhase("implement");
            }}
          >
            Create an architecture design based on these requirements: Features:{" "}
            {JSON.stringify(requirements.features)}
            Constraints: {JSON.stringify(requirements.constraints)}
            Performance: {JSON.stringify(requirements.performance)}
            Return JSON with: architecture (string), components[],
            dependencies[]
          </Claude>
        </Phase>
      )}

      {phase === "implement" && design && (
        <Phase name="Implementation">
          <Claude
            model="sonnet"
            onFinished={(result: any) => {
              console.log("Implementation complete:", result);
              setImplementation(result);
              setPhase("test");
            }}
          >
            Implement the system based on this design: Architecture:{" "}
            {design.architecture}
            Components: {JSON.stringify(design.components)}
            Dependencies: {JSON.stringify(design.dependencies)}
            Return JSON with: files[], tests[], documentation
          </Claude>
        </Phase>
      )}

      {phase === "test" && requirements && implementation && (
        <Phase name="Testing & Verification">
          <Claude
            model="sonnet"
            validate={async (result: any) => {
              return result.all_requirements_met === true;
            }}
            onFinished={() => {
              console.log("All tests passed!");
              setPhase("done");
            }}
            onError={(error) => {
              console.error("Tests failed, returning to implementation");
              setPhase("implement");
            }}
          >
            Test the implementation against the original requirements: Original
            Requirements: - Features: {JSON.stringify(requirements.features)}-
            Constraints: {JSON.stringify(requirements.constraints)}-
            Performance: {JSON.stringify(requirements.performance)}
            Implementation: - Files: {JSON.stringify(implementation.files)}-
            Tests: {JSON.stringify(implementation.tests)}
            Verify all requirements are met. Return JSON with:
            all_requirements_met (boolean), issues[]
          </Claude>
        </Phase>
      )}

      {phase === "done" && (
        <Phase name="Complete">
          <div>
            ✅ Full workflow complete! - {requirements?.features.length}{" "}
            features implemented - {design?.components.length} components
            created - {implementation?.files.length} files written - All tests
            passing
          </div>
        </Phase>
      )}
    </Ralph>
  );
}
```

---

## Running These Examples

### Setup

1. Create a new directory:

```bash
mkdir .smithers && cd .smithers
```

2. Initialize package:

```bash
bun init -y
```

3. Install dependencies:

```bash
bun add smithers zustand
```

4. Copy example to `main.tsx`

5. Run:

```bash
bun run main.tsx
```

### Testing Examples

For testing without real API calls, set mock mode:

```bash
MOCK_MODE=true bun run main.tsx
```

### Monitoring

Watch execution progress:

```bash
bash ../scripts/monitor.sh main.tsx
```

---

## Tips for Writing Workflows

1. **Start Simple** - Begin with sequential workflows
2. **Add Error Handling** - Always include onError callbacks
3. **Use Validation** - Validate results when quality matters
4. **Pass Data Forward** - Store results in Zustand for later phases
5. **Set Limits** - Always use maxIterations
6. **Log Progress** - Use console.log to track execution
7. **Test Locally** - Use MOCK_MODE for testing
8. **Document Intent** - Add comments explaining phase logic

---

## Common Pitfalls

### Infinite Loop

❌ **Wrong:**

```tsx
<Ralph maxIterations={10}>
  <Claude onFinished={() => setPhase("same")}>Task</Claude>
</Ralph>
```

✅ **Right:**

```tsx
<Ralph maxIterations={10}>
  {phase === "start" && (
    <Claude onFinished={() => setPhase("done")}>Task</Claude>
  )}
  {phase === "done" && <div>Complete</div>}
</Ralph>
```

### Using Solid Signals

❌ **Wrong:**

```tsx
const [phase, setPhase] = createSignal("start");
```

✅ **Right:**

```tsx
const useStore = create((set) => ({
  phase: "start",
  setPhase: (phase) => set({ phase }),
}));
```

### Missing Terminal State

❌ **Wrong:**

```tsx
{
  phase === "task1" && (
    <Claude onFinished={() => setPhase("task2")}>...</Claude>
  );
}
{
  phase === "task2" && (
    <Claude onFinished={() => setPhase("task3")}>...</Claude>
  );
}
{
  phase === "task3" && (
    <Claude onFinished={() => setPhase("task1")}>...</Claude>
  );
}
// Loops forever!
```

✅ **Right:**

```tsx
{
  phase === "task3" && <Claude onFinished={() => setPhase("done")}>...</Claude>;
}
{
  phase === "done" && <div>Complete</div>;
}
```

---

## Next Steps

- Explore [REFERENCE.md](./REFERENCE.md) for complete API docs
- Read [SKILL.md](./SKILL.md) for usage guidelines
- Check the main Smithers docs for advanced patterns
