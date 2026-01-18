# Smithers Orchestration Examples

Complete working examples demonstrating Smithers patterns with automatic phase/step state management.

## Example 1: Simple Sequential Workflow

A basic three-phase workflow that executes sequentially. No manual state management needed!

```tsx
/**
 * Simple Sequential Workflow
 *
 * Phases execute automatically in declaration order.
 * When one phase completes, the next begins.
 */

import { Ralph, Claude, Phase } from "smithers";

export default function SequentialWorkflow() {
  return (
    <Ralph maxIterations={3}>
      <Phase name="Research">
        <Claude model="sonnet">
          Research best practices for building a REST API with Node.js.
          Focus on security, performance, and scalability.
        </Claude>
      </Phase>

      <Phase name="Implementation">
        <Claude model="sonnet">
          Implement a REST API based on the research findings.
          Include proper error handling and validation.
        </Claude>
      </Phase>

      <Phase name="Testing">
        <Claude model="sonnet">
          Write comprehensive tests for the API.
          Verify all endpoints work correctly.
        </Claude>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 2: Conditional Phase Skipping

Use `skipIf` to conditionally skip phases based on runtime conditions.

```tsx
/**
 * Conditional Phase Skipping
 *
 * The skipIf prop lets you skip phases based on conditions.
 * Skipped phases still appear in the output but don't execute.
 */

import { Ralph, Claude, Phase } from "smithers";

// Check if tests already exist
const testsExist = () => Bun.file("./src/tests/api.test.ts").exists();

export default function ConditionalWorkflow() {
  return (
    <Ralph maxIterations={3}>
      <Phase name="Analyze">
        <Claude model="opus">
          Analyze the codebase in src/ for potential issues.
          Return findings as structured output.
        </Claude>
      </Phase>

      <Phase name="Fix Issues">
        <Claude model="sonnet">
          Fix any issues identified in the analysis phase.
        </Claude>
      </Phase>

      <Phase name="Write Tests" skipIf={testsExist}>
        <Claude model="sonnet">
          Write tests for the codebase.
          Skip if tests already exist.
        </Claude>
      </Phase>

      <Phase name="Verify">
        <Claude model="sonnet">
          Run all tests and verify the fixes work correctly.
        </Claude>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 3: Sequential Steps Within Phases

Steps within a phase execute sequentially by default.

```tsx
/**
 * Sequential Steps
 *
 * Steps within a Phase execute one after another.
 * Each step waits for the previous to complete.
 */

import { Ralph, Claude, Phase, Step } from "smithers";

export default function StepsWorkflow() {
  return (
    <Ralph maxIterations={3}>
      <Phase name="Setup">
        <Claude>Initialize the project environment.</Claude>
      </Phase>

      <Phase name="Implementation">
        <Step name="Write Models">
          <Claude model="sonnet">
            Create the database models for User, Post, and Comment.
          </Claude>
        </Step>

        <Step name="Write Controllers">
          <Claude model="sonnet">
            Create controllers for each model with CRUD operations.
          </Claude>
        </Step>

        <Step name="Write Routes">
          <Claude model="sonnet">
            Set up API routes connecting to the controllers.
          </Claude>
        </Step>
      </Phase>

      <Phase name="Testing">
        <Claude model="sonnet">
          Write integration tests for all API endpoints.
        </Claude>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 4: Parallel Execution

Use the `<Parallel>` component for concurrent step execution.

```tsx
/**
 * Parallel Execution
 *
 * Wrap steps in <Parallel> to execute them concurrently.
 * All parallel steps run simultaneously.
 */

import { Ralph, Claude, Phase, Step, Parallel } from "smithers";

export default function ParallelWorkflow() {
  return (
    <Ralph maxIterations={3}>
      <Phase name="Setup">
        <Claude>Initialize the environment for parallel work.</Claude>
      </Phase>

      <Phase name="Build">
        <Parallel>
          <Step name="Frontend">
            <Claude model="sonnet">
              Build the frontend components:
              - User dashboard
              - Login form
              - Navigation
            </Claude>
          </Step>

          <Step name="Backend">
            <Claude model="sonnet">
              Build the backend API:
              - Authentication endpoints
              - User management
              - Data validation
            </Claude>
          </Step>

          <Step name="Database">
            <Claude model="sonnet">
              Set up the database:
              - Schema design
              - Migrations
              - Seed data
            </Claude>
          </Step>
        </Parallel>
      </Phase>

      <Phase name="Integration">
        <Claude model="opus">
          Integrate all components and verify they work together.
        </Claude>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 5: Mixed Sequential and Parallel

Combine sequential phases with parallel steps for complex workflows.

```tsx
/**
 * Mixed Sequential and Parallel
 *
 * Phases are sequential, but steps within can be parallel or sequential.
 */

import { Ralph, Claude, Phase, Step, Parallel } from "smithers";

export default function MixedWorkflow() {
  return (
    <Ralph maxIterations={5}>
      <Phase name="Research">
        <Parallel>
          <Step name="Research Frontend">
            <Claude>Research React best practices for 2024.</Claude>
          </Step>
          <Step name="Research Backend">
            <Claude>Research Bun server patterns and APIs.</Claude>
          </Step>
        </Parallel>
      </Phase>

      <Phase name="Implementation">
        {/* Sequential steps - each waits for the previous */}
        <Step name="Setup Project">
          <Claude>Initialize the project with Bun and React.</Claude>
        </Step>

        <Step name="Core Features">
          <Parallel>
            <Claude>Build authentication system.</Claude>
            <Claude>Build data management layer.</Claude>
          </Parallel>
        </Step>

        <Step name="Polish">
          <Claude>Add error handling and loading states.</Claude>
        </Step>
      </Phase>

      <Phase name="Deploy">
        <Step name="Build">
          <Claude>Create production build.</Claude>
        </Step>
        <Step name="Deploy">
          <Claude>Deploy to production server.</Claude>
        </Step>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 6: Error Handling with Validation

Use validation and callbacks for robust error handling.

```tsx
/**
 * Error Handling with Validation
 *
 * Use validate prop to check results and onError for failures.
 */

import { Ralph, Claude, Phase, Step } from "smithers";

export default function ValidationWorkflow() {
  return (
    <Ralph maxIterations={5}>
      <Phase name="Implementation">
        <Claude
          model="sonnet"
          validate={async (result) => {
            // Validate the implementation meets requirements
            return result.includes("export") && result.includes("function");
          }}
          onError={(error) => {
            console.error("Implementation failed:", error.message);
          }}
        >
          Implement a utility function that exports a named function.
          The code must compile and follow best practices.
        </Claude>
      </Phase>

      <Phase name="Testing">
        <Claude
          model="sonnet"
          validate={async (result) => {
            return result.includes("test(") || result.includes("it(");
          }}
        >
          Write tests for the utility function.
          Tests must use Bun's test framework.
        </Claude>
      </Phase>

      <Phase name="Verification">
        <Step name="Run Tests">
          <Claude
            validate={async (result) => {
              return result.toLowerCase().includes("pass");
            }}
          >
            Run bun test and report results.
            All tests must pass.
          </Claude>
        </Step>

        <Step name="Type Check">
          <Claude
            validate={async (result) => {
              return !result.toLowerCase().includes("error");
            }}
          >
            Run bun build --dry-run to check for type errors.
          </Claude>
        </Step>
      </Phase>
    </Ralph>
  );
}
```

---

## Example 7: VCS Integration with Steps

Use step-level VCS integration for granular commits.

```tsx
/**
 * VCS Integration
 *
 * Steps can create snapshots and commits automatically.
 */

import { Ralph, Claude, Phase, Step } from "smithers";

export default function VCSWorkflow() {
  return (
    <Ralph maxIterations={3}>
      <Phase name="Feature Development">
        <Step
          name="Add Models"
          snapshotBefore
          commitAfter
          commitMessage="feat: add user and post models"
        >
          <Claude model="sonnet">
            Create User and Post models in src/models/
          </Claude>
        </Step>

        <Step
          name="Add Controllers"
          snapshotBefore
          commitAfter
          commitMessage="feat: add user and post controllers"
        >
          <Claude model="sonnet">
            Create controllers for User and Post in src/controllers/
          </Claude>
        </Step>

        <Step
          name="Add Routes"
          snapshotBefore
          commitAfter
          commitMessage="feat: add API routes"
        >
          <Claude model="sonnet">
            Set up routes in src/routes/index.ts
          </Claude>
        </Step>
      </Phase>

      <Phase name="Testing">
        <Step
          name="Write Tests"
          commitAfter
          commitMessage="test: add integration tests"
        >
          <Claude model="sonnet">
            Write integration tests for all new endpoints.
          </Claude>
        </Step>
      </Phase>
    </Ralph>
  );
}
```

---

## Running Examples

### Setup

1. Create a `.smithers` directory:

```bash
mkdir .smithers && cd .smithers
```

2. Initialize package:

```bash
bun init -y
```

3. Install Smithers:

```bash
bun add smithers
```

4. Copy example to `main.tsx`

5. Run:

```bash
bun run main.tsx
```

### Testing

For testing without real API calls:

```bash
MOCK_MODE=true bun run main.tsx
```

### Monitoring

Watch execution progress:

```bash
bash ../scripts/monitor.sh main.tsx
```

---

## Key Concepts

### Automatic Phase Sequencing

Phases execute in declaration order. No manual state management needed:

```tsx
<Ralph>
  <Phase name="First">...</Phase>   {/* Executes first */}
  <Phase name="Second">...</Phase>  {/* Executes after First completes */}
  <Phase name="Third">...</Phase>   {/* Executes after Second completes */}
</Ralph>
```

### Automatic Step Sequencing

Steps within a phase execute sequentially by default:

```tsx
<Phase name="Build">
  <Step name="A">...</Step>  {/* Executes first */}
  <Step name="B">...</Step>  {/* Waits for A */}
  <Step name="C">...</Step>  {/* Waits for B */}
</Phase>
```

### Parallel Execution

Use `<Parallel>` to execute steps concurrently:

```tsx
<Phase name="Build">
  <Parallel>
    <Step name="A">...</Step>  {/* All three */}
    <Step name="B">...</Step>  {/* execute at */}
    <Step name="C">...</Step>  {/* the same time */}
  </Parallel>
</Phase>
```

### Skip Conditions

Use `skipIf` to conditionally skip phases:

```tsx
<Phase name="Optional" skipIf={() => someCondition}>
  ...
</Phase>
```

---

## Common Pitfalls

### Don't Use External State for Phase Control

```tsx
// WRONG - Don't use Zustand or useState for phase control
const [phase, setPhase] = useState("research");
{phase === "research" && <Phase name="Research">...</Phase>}
```

### Let Smithers Manage Phase State

```tsx
// RIGHT - Declare all phases, Smithers manages which is active
<Phase name="Research">...</Phase>
<Phase name="Implement">...</Phase>
```

### Don't Manually Advance Phases

```tsx
// WRONG - Don't use callbacks to change phase
<Claude onFinished={() => setPhase("next")}>...</Claude>
```

### Phases Auto-Advance on Completion

```tsx
// RIGHT - Phase automatically advances when children complete
<Phase name="Current">
  <Claude>Work here...</Claude>
</Phase>
<Phase name="Next">
  {/* Automatically becomes active when Current completes */}
</Phase>
```

---

## Next Steps

- Explore [REFERENCE.md](./REFERENCE.md) for complete API docs
- Read [SKILL.md](./SKILL.md) for usage guidelines
- Check the main Smithers docs for advanced patterns
