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
  Worktree,
  Each,
  If,
  useSmithers,
  useWorktree,
  type AgentResult,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/db";

interface DelegatedTask {
  id: string;
  branch: string;
  description: string;
  files: string[];
  tests: { e2e: string[]; integration: string[]; unit: string[] };
}

interface MergeQueueEntry {
  worktree: string;
  branch: string;
  timestamp: number;
  status: "pending" | "merging" | "merged" | "failed";
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
    Bun.file(`${DOCS_DIR}/PRD.md`).text(),
    Bun.file(`${DOCS_DIR}/ENGINEERING.md`).text(),
    Bun.file(`${DOCS_DIR}/DESIGN.md`).text(),
    Bun.file(`${DOCS_DIR}/WORKFLOW.md`).text(),
    Bun.file(`${DOCS_DIR}/NEW_FEATURES_DESIGN.md`).text(),
  ]);
  return { PRD, ENGINEERING, DESIGN, WORKFLOW, NEW_FEATURES };
}

function createPlanningPrompt(docs: Docs): string {
  return `
<prd>
${docs.PRD}
</prd>

<engineering>
${docs.ENGINEERING}
</engineering>

<design>
${docs.DESIGN}
</design>

<workflow>
${docs.WORKFLOW}
</workflow>

<new_features>
${docs.NEW_FEATURES}
</new_features>

<task>
Analyze current state. Plan exactly 3 parallelizable tasks.
Tasks must be independent (no shared file modifications).
</task>

<output_format>
JSON array of 3 tasks:
[{"id":"task-1","branch":"feature/x","description":"...","files":[],"tests":{"e2e":[],"integration":[],"unit":[]}}]
</output_format>
`;
}

const REVIEW_PROMPT = `
<criteria>
1. Matches PRD requirements
2. Follows ENGINEERING.md architecture
3. Follows DESIGN.md guidelines
4. Sufficient tests (E2E, integration, unit)
5. Clean and maintainable
</criteria>

<output>{"verdict":"LGTM"|"REQUEST_CHANGES","comments":[],"blocking_issues":[]}</output>
`;

function useTasks(): DelegatedTask[] {
  const { reactiveDb } = useSmithers();
  // Query the latest completed planner agent's result
  const queryResult = useQueryValue<string | null>(
    reactiveDb,
    `SELECT result FROM agents
     WHERE system_prompt LIKE '%Lead architect%'
       AND status = 'completed'
       AND result IS NOT NULL
     ORDER BY completed_at DESC LIMIT 1`,
    []
  );

  // Debug: check what useQueryValue returns
  console.log(`[useTasks] queryResult type=${typeof queryResult}, value=${queryResult ? 'present' : 'null'}`);

  // Handle the case where queryResult is the { data } wrapper
  const result = typeof queryResult === 'object' && queryResult !== null && 'data' in (queryResult as object)
    ? (queryResult as { data: string | null }).data
    : queryResult;

  console.log(`[useTasks] result type=${typeof result}, present=${result ? 'yes' : 'no'}`);

  if (!result || typeof result !== "string") return [];

  // Parse JSON array from result
  const match = result.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const tasks = JSON.parse(match[0]) as DelegatedTask[];
    console.log(`[useTasks] parsed ${tasks.length} tasks`);
    return tasks.length === 3 ? tasks : [];
  } catch (e) {
    console.log(`[useTasks] parse error: ${e}`);
    return [];
  }
}

function useMergeQueue() {
  const { db } = useSmithers();
  return {
    queue: db.state.get<MergeQueueEntry[]>("mergeQueue") ?? [],
    add: (entry: MergeQueueEntry) => {
      const queue = db.state.get<MergeQueueEntry[]>("mergeQueue") ?? [];
      db.state.set("mergeQueue", [...queue, entry], "queue_add");
    },
    update: (worktree: string, status: MergeQueueEntry["status"]) => {
      const queue = db.state.get<MergeQueueEntry[]>("mergeQueue") ?? [];
      db.state.set("mergeQueue", queue.map(e => 
        e.worktree === worktree ? { ...e, status } : e
      ), "queue_update");
    },
  };
}

function useTestGate() {
  const passedRef = useRef(false);
  return {
    passed: passedRef.current,
    markPassed: () => { passedRef.current = true; },
    condition: () => !passedRef.current,
  };
}

function TaskPlanner({ prompt }: { prompt: string }): ReactNode {
  return (
    <Claude
      model="sonnet"
      systemPrompt="Lead architect. Output valid JSON only."
    >
      {prompt}
    </Claude>
  );
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function Implementer({ task, timeout = ONE_HOUR_MS }: { task: DelegatedTask; timeout?: number }): ReactNode {
  return (
    <Claude
      model="sonnet"
      systemPrompt={`Implementing: ${task.description}`}
      permissionMode="bypassPermissions"
      timeout={timeout}
    >
      {`
<task>${JSON.stringify(task, null, 2)}</task>
<rules>
1. TDD: tests first
2. Only modify assigned files: ${task.files.join(", ")}
3. Run tests after
</rules>
      `}
    </Claude>
  );
}

function Reviewer({ label }: { label: string }): ReactNode {
  return (
    <Claude model="sonnet" systemPrompt={`Reviewer: ${label}`}>
      {REVIEW_PROMPT}
    </Claude>
  );
}

function TestRunner({ cwd, onPass, onFail }: { 
  cwd: string; 
  onPass: () => void; 
  onFail: () => void;
}): ReactNode {
  const hasRunRef = useRef(false);

  if (!hasRunRef.current) {
    hasRunRef.current = true;
    Bun.spawn(["bun", "test"], { cwd })
      .exited.then((code) => {
        if (code === 0) onPass();
        else onFail();
      });
  }

  return null;
}

function Committer({ message }: { message: string }): ReactNode {
  return (
    <Claude
      model="sonnet"
      systemPrompt="Commit changes."
      permissionMode="bypassPermissions"
    >
      {`jj commit -m "${message}"`}
    </Claude>
  );
}

function Merger({ branch, onResult }: { 
  branch: string; 
  onResult: (success: boolean) => void;
}): ReactNode {
  const hasRunRef = useRef(false);

  if (!hasRunRef.current) {
    hasRunRef.current = true;
    Bun.spawn(["jj", "rebase", "-b", branch, "-d", "main"])
      .exited.then((code) => onResult(code === 0));
  }

  return null;
}

function SmithersHubWorkflow({ planningPrompt }: { planningPrompt: string }): ReactNode {
  const tasks = useTasks();
  const allPlanned = tasks.length === 3;
  const allImplemented = allPlanned; // TODO: track completion

  console.log(`[Workflow] tasks.length=${tasks.length}, allPlanned=${allPlanned}`);

  return (
    <Ralph
      id="smithershub"
      condition={() => !allImplemented}
      maxIterations={10}
    >
      <Phase name="plan">
        <Step name="delegate-tasks">
          {!allPlanned && <TaskPlanner prompt={planningPrompt} />}
        </Step>
      </Phase>

      <Phase name="execute">
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
