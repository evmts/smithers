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
import { useTasks, usePlannerResult } from "./src/hooks";
import { TaskPlanner as TaskPlannerComponent } from "./src/components/TaskPlanner";
import type { ExecutionPlan } from "./src/hooks/useTasks";

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

function useTaskPlannerSystem() {
  const { db } = useSmithers();
  const tasksHook = useTasks({ db: db.db as any });
  const plannerHook = usePlannerResult();

  return {
    tasksHook,
    plannerHook,
    // Legacy compatibility: map new system to old DelegatedTask format
    getLegacyTasks: (): DelegatedTask[] => {
      const tasks = tasksHook.getTasksByStatus('completed');
      return tasks.slice(0, 3).map((task, index) => ({
        id: task.id,
        branch: `feature/${task.title.toLowerCase().replace(/\s+/g, '-')}`,
        description: task.description || task.title,
        files: [], // Would be populated from task metadata
        tests: { e2e: [], integration: [], unit: [] } // Would be populated from task metadata
      }));
    }
  };
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

function TaskPlannerAgent({ prompt }: { prompt: string }): ReactNode {
  return (
    <Claude
      model="sonnet"
      systemPrompt="Lead architect. Output valid JSON only."
    >
      {prompt}
    </Claude>
  );
}

function EnhancedTaskPlanner({ planningPrompt }: { planningPrompt: string }): ReactNode {
  const { db } = useSmithers();

  // Mock agent system for task execution
  const mockAgentSystem = {
    async executePlan(plan: ExecutionPlan) {
      // Integrate with existing Claude agents
      return {
        id: `execution-${Date.now()}`,
        planId: plan.id,
        status: 'completed' as const,
        results: plan.phases.flatMap(phase =>
          phase.tasks.map(taskId => ({
            taskId,
            status: 'completed' as const,
            output: `Task ${taskId} completed via Claude agent`,
            executionTime: 1000 + Math.floor(Math.random() * 4000)
          }))
        ),
        summary: `Successfully executed ${plan.phases.length} phases`,
        metrics: {
          totalDuration: 5000,
          tasksCompleted: plan.phases.flatMap(p => p.tasks).length,
          tasksError: 0,
          successRate: 1.0
        },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
    },

    getAvailableAgents: () => [
      { id: 'claude-sonnet', name: 'Claude Sonnet', capabilities: ['implementation', 'analysis', 'testing'] },
      { id: 'claude-opus', name: 'Claude Opus', capabilities: ['complex-reasoning', 'architecture', 'review'] },
      { id: 'claude-haiku', name: 'Claude Haiku', capabilities: ['quick-tasks', 'simple-fixes', 'validation'] }
    ]
  };

  return (
    <TaskPlannerComponent
      db={db.db as any}
      agentSystem={mockAgentSystem}
      enableRealTimeUpdates={true}
      onTaskCreate={(task) => {
        console.log('Task created:', task.title);
      }}
      onPlanExecute={(plan) => {
        console.log('Executing plan:', plan.title);
      }}
    />
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
      outputFormat="stream-json"
      onProgress={(chunk) => process.stdout.write(chunk)}
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
  const taskPlannerSystem = useTaskPlannerSystem();
  const legacyTasks = taskPlannerSystem.getLegacyTasks();
  const allPlanned = legacyTasks.length === 3;

  // Check if we have active plans being executed
  const hasActivePlans = taskPlannerSystem.plannerHook.isExecuting;

  console.log(`[Workflow] legacyTasks.length=${legacyTasks.length}, allPlanned=${allPlanned}, hasActivePlans=${hasActivePlans}`);

  return (
    <Ralph
      id="smithershub"
      condition={() => true}  // Infinite loop until manually stopped
      maxIterations={1000}
    >
      <Phase name="modern-planning">
        <Step name="enhanced-task-planner">
          <If condition={() => !hasActivePlans}>
            <EnhancedTaskPlanner planningPrompt={planningPrompt} />
          </If>
        </Step>
      </Phase>

      <Phase name="legacy-planning">
        <Step name="delegate-tasks">
          {!allPlanned && <TaskPlannerAgent prompt={planningPrompt} />}
        </Step>
      </Phase>

      <Phase name="execute-legacy">
        <If condition={() => allPlanned}>
          <Parallel>
            <Each items={legacyTasks}>
              {(task) => (
                <Step key={task.id} name={`implement-${task.id}`}>
                  <Implementer task={task} />
                </Step>
              )}
            </Each>
          </Parallel>
        </If>
      </Phase>

      <Phase name="execute-modern">
        <Step name="modern-execution-monitor">
          <If condition={() => hasActivePlans}>
            <ModernExecutionMonitor />
          </If>
        </Step>
      </Phase>
    </Ralph>
  );
}

function ModernExecutionMonitor(): ReactNode {
  const taskPlannerSystem = useTaskPlannerSystem();
  const progress = taskPlannerSystem.plannerHook.progress;

  // Log progress for monitoring
  if (progress.current) {
    console.log(`[Modern Execution] ${progress.completed}/${progress.total}: ${progress.current}`);
  }

  // Handle execution completion
  if (taskPlannerSystem.plannerHook.result) {
    const result = taskPlannerSystem.plannerHook.result;
    console.log(`[Modern Execution] Completed: ${result.summary}`);
    console.log(`[Modern Execution] Success rate: ${(result.metrics.successRate * 100).toFixed(1)}%`);
  }

  // Handle execution errors
  if (taskPlannerSystem.plannerHook.error) {
    console.error(`[Modern Execution] Error: ${taskPlannerSystem.plannerHook.error}`);
  }

  return null; // This is a monitoring component, no UI needed in workflow
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
