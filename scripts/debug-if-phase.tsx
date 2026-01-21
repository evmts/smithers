#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */
/**
 * Test If/Phase/Step pattern like build-smithers-py.tsx
 */

import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Ralph,
  Phase,
  Step,
  Claude,
  If,
  useSmithers,
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/db";

const { promise: orchestrationPromise, token: orchestrationToken } = createOrchestrationPromise();

const db = createSmithersDB({ path: ".smithers/debug-if-phase.db" });
const executionId = db.execution.start("Debug If Phase", "debug-if-phase.tsx");
db.state.set("testPhase", "research", "init");

console.log("=== Debug If/Phase Test ===");
console.log("ExecutionId:", executionId);

function TestWorkflow() {
  const { db, reactiveDb } = useSmithers();

  const { data: phaseData } = useQueryValue<string>(
    reactiveDb,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = 'testPhase'"
  );
  const phase = phaseData ?? "research";

  console.log("TestWorkflow rendering, phase:", phase);

  return (
    <>
      <If condition={phase === "research"}>
        <Phase name="Research">
          <Step name="analyze">
            <Claude
              model="haiku"
              maxTurns={1}
              allowedTools={[]}
              onFinished={(r) => {
                console.log("Claude finished!", r.output?.slice(0, 100));
                db.state.set("testPhase", "done", "claude_finished");
              }}
              onError={(e) => {
                console.log("Claude error!", e.message);
                signalOrchestrationCompleteByToken(orchestrationToken);
              }}
            >
              Say "Hello from If/Phase/Step" and nothing else.
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "done"}>
        <Phase name="Complete">
          <Step name="finish">
            <Claude
              model="haiku"
              maxTurns={1}
              allowedTools={[]}
              onFinished={(r) => {
                console.log("Final Claude finished!");
                signalOrchestrationCompleteByToken(orchestrationToken);
              }}
            >
              Say "All done!" and nothing else.
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

function App() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph
        id="test"
        condition={() => {
          const p = db.state.get("testPhase");
          return p !== "done";
        }}
        maxIterations={5}
        onIteration={(i) => console.log(`--- Iteration ${i} ---`)}
        onComplete={() => {
          console.log("Ralph complete");
          signalOrchestrationCompleteByToken(orchestrationToken);
        }}
      >
        <TestWorkflow />
      </Ralph>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.render(<App />);
await new Promise(r => setTimeout(r, 500));

console.log("Initial Plan:", root.toXML());

try {
  await Promise.race([
    orchestrationPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 120s")), 120000))
  ]);
  console.log("=== SUCCESS ===");
  console.log("Final State:", JSON.stringify(db.state.getAll(), null, 2));
} catch (err) {
  console.error("=== FAILED ===", err);
  console.log("State at failure:", JSON.stringify(db.state.getAll(), null, 2));
} finally {
  root.dispose();
  db.close();
}
