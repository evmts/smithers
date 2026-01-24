#!/usr/bin/env smithers

import { useRef, type ReactNode } from "react";
import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Claude,
  Ralph,
  Phase,
  Step,
  Parallel,
  Each,
  useSmithers,
} from "smithers-orchestrator";
import { useQuery, useQueryValue } from "smithers-orchestrator/db";

interface DelegatedTask {
  id: string;
  branch: string;
  description: string;
  files: string[];
  tests: { e2e: string[]; integration: string[]; unit: string[] };
}

interface Docs {
  PRD: string;
  ENGINEERING: string;
  DESIGN: string;
  WORKFLOW: string;
  NEW_FEATURES: string;
}

const DOCS_DIR = import.meta.dir;

async function loadDocs(): Promise<Docs> {
  const [PRD, ENGINEERING, DESIGN, WORKFLOW, NEW_FEATURES] = await Promise.all([
    Bun.file(`${DOCS_DIR}/PRD.md`).text().catch(() => ""),
    Bun.file(`${DOCS_DIR}/ENGINEERING.md`).text().catch(() => ""),
    Bun.file(`${DOCS_DIR}/DESIGN.md`).text().catch(() => ""),
    Bun.file(`${DOCS_DIR}/WORKFLOW.md`).text().catch(() => ""),
    Bun.file(`${DOCS_DIR}/NEW_FEATURES.md`).text().catch(() => ""),
  ]);
  return { PRD, ENGINEERING, DESIGN, WORKFLOW, NEW_FEATURES };
}

function createPlanningPrompt(docs: Docs): string {
  return `
<documents>
<prd>${docs.PRD}</prd>
<engineering>${docs.ENGINEERING}</engineering>
<design>${docs.DESIGN}</design>
<workflow>${docs.WORKFLOW}</workflow>
<new_features>${docs.NEW_FEATURES}</new_features>
</documents>

<task>
Analyze the documents and create exactly 3 parallelizable implementation tasks.
Each task must be independent and completable by a single agent.
</task>

<output_format>
JSON array of 3 tasks:
[{"id":"task-1","branch":"feature/x","description":"...","files":[],"tests":{"e2e":[],"integration":[],"unit":[]}}]
</output_format>
`;
}

// Hook to get planned tasks from the planner agent's output
function usePlannedTasks(): { tasks: DelegatedTask[]; isPlanning: boolean } {
  const { reactiveDb } = useSmithers();

  // Query for a completed planner agent result - use useQuery to get the full row
  const { data: plannerRows } = useQuery<{ result: string }>(
    reactiveDb,
    `SELECT result FROM agents
     WHERE result LIKE '%task-1%' AND result LIKE '%task-2%' AND result LIKE '%task-3%'
     AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
    []
  );

  // Check if planner is currently running
  const runningResult = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as c FROM agents WHERE status = 'running'`,
    []
  );

  const plannerResult = plannerRows?.[0]?.result;
  const isPlanning = (runningResult ?? 0) > 0;

  console.log(`[usePlannedTasks] plannerRows.length=${plannerRows?.length ?? 0}, result=${plannerResult ? `${plannerResult.length} chars` : 'null'}, isPlanning=${isPlanning}`);

  if (!plannerResult) {
    return { tasks: [], isPlanning };
  }

  // Parse JSON from the planner output (it may have markdown around it)
  try {
    const jsonMatch = plannerResult.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : plannerResult;
    const parsed = JSON.parse(jsonStr.trim());
    if (Array.isArray(parsed) && parsed.length >= 3) {
      console.log(`[usePlannedTasks] Parsed ${parsed.length} tasks from planner output`);
      return { tasks: parsed.slice(0, 3), isPlanning: false };
    }
  } catch (e) {
    console.error('[usePlannedTasks] Failed to parse planner output:', e);
  }

  return { tasks: [], isPlanning };
}

function TaskPlannerAgent({ prompt }: { prompt: string }): ReactNode {
  return (
    <Claude
      model="sonnet"
      systemPrompt="Lead architect. Output valid JSON only. Wrap JSON in ```json code block."
    >
      {prompt}
    </Claude>
  );
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function Implementer({ task, timeout = ONE_HOUR_MS }: { task: DelegatedTask; timeout?: number }): ReactNode {
  console.log(`[Implementer] Starting task: ${task.id} - ${task.description}`);
  return (
    <Claude
      model="sonnet"
      systemPrompt={`Senior engineer. Implement the task. Follow TDD. Run tests after.`}
      permissionMode="bypassPermissions"
      timeout={timeout}
    >
      {`
<task>
ID: ${task.id}
Branch: ${task.branch}
Description: ${task.description}
Files to modify: ${task.files.join(", ")}
</task>

<rules>
1. Write tests first (TDD)
2. Only modify the assigned files
3. Run tests after implementation
4. Ensure all tests pass
</rules>

<output>
When done, output a summary of:
- Files modified
- Tests written
- Test results
</output>
      `}
    </Claude>
  );
}

function SmithersHubWorkflow({ planningPrompt }: { planningPrompt: string }): ReactNode {
  const { tasks, isPlanning } = usePlannedTasks();
  const allPlanned = tasks.length >= 3;

  console.log(`[Workflow] tasks=${tasks.length}, allPlanned=${allPlanned}, isPlanning=${isPlanning}`);

  return (
    <Ralph
      id="smithershub"
      condition={() => !allPlanned}  // Stop when we have planned tasks
      maxIterations={10}
    >
      <Phase name="plan">
        <Step name="delegate-tasks">
          {!allPlanned && !isPlanning && <TaskPlannerAgent prompt={planningPrompt} />}
        </Step>
      </Phase>

      <Phase name="execute" skipIf={() => !allPlanned}>
        <Parallel>
          <Each items={tasks}>
            {(task) => (
              <Step key={task.id} name={`implement-${task.id}`}>
                <Implementer task={task} />
              </Step>
            )}
          </Each>
        </Parallel>
      </Phase>
    </Ralph>
  );
}

async function main(): Promise<void> {
  const db = createSmithersDB({ path: `${DOCS_DIR}/.smithers/smithershub.db` });
  const executionId = db.execution.start("SmithersHub", "smithershub-workflow.tsx");
  const docs = await loadDocs();
  const planningPrompt = createPlanningPrompt(docs);

  const root = createSmithersRoot();
  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId}>
      <SmithersHubWorkflow planningPrompt={planningPrompt} />
    </SmithersProvider>
  ));
  await db.close();
}

main().catch(console.error);
