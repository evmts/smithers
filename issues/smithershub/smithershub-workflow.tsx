#!/usr/bin/env smithers
/**
 * SmithersHub Implementation Workflow
 * 
 * A Ralph loop that incrementally implements SmithersHub using:
 * - Round-robin Codex/Claude for implementation
 * - Gemini for design work (CSS, HTML, JSX)
 * - Multi-agent review (Gemini, Claude, Codex)
 * - TDD approach with E2E, integration, and unit tests
 * - JJ snapshots on every change
 */

import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Claude,
  Codex,
  // TODO: These need to be implemented
  // Gemini,
  // RoundRobin,
  // CommitAndVerify,
  // DynamicFlow,
} from "smithers-orchestrator";

const db = createSmithersDB({ path: ".smithers/smithershub.db" });
const executionId = db.execution.start("SmithersHub", "smithershub-workflow.tsx");

// Configuration
const ITERATION_TIMEOUT_MS = 10_000;
const AGENTS = ["codex", "claude"] as const;

// Context files the agent reads each iteration
const CONTEXT_FILES = [
  "issues/smithershub/PRD.md",
  "issues/smithershub/ENGINEERING.md", 
  "issues/smithershub/DESIGN.md",
  "issues/smithershub/WORKFLOW.md",
  "issues/smithershub/NEW_FEATURES_DESIGN.md",
];

// Structured prompt for the planning phase
const PLANNING_PROMPT = `
<context>
You are implementing SmithersHub incrementally. Read the attached docs.

<available_phases>
- plan: Decide the next single task
- implement: Write code using TDD
- review: Get 3x LGTM from Gemini, Claude, Codex
- commit: JJ commit and verify clean repo
</available_phases>

<rules>
1. Implement ONE thing per iteration
2. Use TDD: write tests first
3. E2E Playwright tests are highest priority
4. Integration tests second
5. Unit tests for everything (~100% coverage)
6. Design work (CSS/HTML/JSX) → delegate to Gemini
7. After implementation, wait for 3x LGTM reviews
8. Only commit when all reviews pass
</rules>

<output_format>
Return a structured response:
{
  "phase": "plan" | "implement" | "review" | "commit",
  "task": "Description of the single task",
  "is_design_work": boolean,
  "delegate_to": "gemini" | null,
  "files_to_create": ["path/to/file.ts"],
  "files_to_modify": ["path/to/existing.ts"],
  "tests_to_write": {
    "e2e": ["test description"],
    "integration": ["test description"],
    "unit": ["test description"]
  }
}
</output_format>
</context>

Read the current implementation state and decide: what is the single next task?
`;

const REVIEW_PROMPT = `
<context>
You are reviewing a change to SmithersHub.

<criteria>
1. Does it match the PRD requirements?
2. Does it follow the ENGINEERING.md architecture?
3. Does it follow the DESIGN.md guidelines?
4. Are there sufficient tests (E2E, integration, unit)?
5. Is the code clean and maintainable?
</criteria>

<output_format>
{
  "verdict": "LGTM" | "REQUEST_CHANGES",
  "comments": ["specific feedback"],
  "blocking_issues": ["must fix before merge"]
}
</output_format>
</context>

Review the attached changes.
`;

/**
 * Main workflow component
 * 
 * TODO: This is a scaffold. The following features need to be implemented first:
 * 1. RoundRobin component
 * 2. Agent-as-tool-call (invoke_agent)
 * 3. JJ snapshot integration
 * 4. CommitAndVerify component
 * 5. DynamicFlow component
 * 6. Gemini component
 */
function SmithersHubWorkflow() {
  // TODO: Replace with RoundRobin once implemented
  // const agent = useRoundRobin(AGENTS);
  
  // TODO: Replace with DynamicFlow once implemented
  // For now, using hardcoded phases as a scaffold
  
  return (
    <SmithersProvider 
      db={db} 
      executionId={executionId} 
      maxIterations={100}
      // TODO: Add iterationTimeout prop once implemented
      // iterationTimeout={ITERATION_TIMEOUT_MS}
    >
      {/* 
        SCAFFOLD: This will be replaced with DynamicFlow
        
        The actual implementation should:
        1. Use RoundRobin to alternate Codex/Claude
        2. Use invoke_agent tool for delegation
        3. Use JJWrapper for snapshots
        4. Use CommitAndVerify for safe commits
      */}
      
      {/* Phase 1: Plan */}
      <Claude 
        model="sonnet"
        systemPrompt="You are a senior engineer planning SmithersHub implementation."
      >
        {PLANNING_PROMPT}
        
        Context files:
        {CONTEXT_FILES.map(f => `@${f}`).join("\n")}
      </Claude>
      
      {/* 
        TODO: Remaining phases need new components:
        
        Phase 2: Implement (with RoundRobin + delegation)
        Phase 3: Review (3x agents in parallel)
        Phase 4: Commit (with JJ verify)
        
        See NEW_FEATURES_DESIGN.md for specs.
      */}
    </SmithersProvider>
  );
}

// Entry point
async function main() {
  console.log("Starting SmithersHub implementation workflow...");
  console.log("Iteration timeout:", ITERATION_TIMEOUT_MS, "ms");
  console.log("Agents:", AGENTS.join(", "));
  
  const root = createSmithersRoot();
  await root.mount(SmithersHubWorkflow);
  await db.close();
}

main().catch(console.error);
