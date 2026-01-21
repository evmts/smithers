#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */
/**
 * Test Phase/Step with Claude
 */

import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Ralph,
  Phase,
  Step,
  Claude,
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
} from "smithers-orchestrator";

const { promise: orchestrationPromise, token: orchestrationToken } = createOrchestrationPromise();

const db = createSmithersDB({ path: ".smithers/debug-phase-step.db" });
const executionId = db.execution.start("Debug Phase Step", "debug-phase-step.tsx");
db.state.set("phase", "test", "init");

console.log("=== Debug Phase/Step Test ===");
console.log("ExecutionId:", executionId);

function TestWorkflow() {
  console.log("TestWorkflow rendering...");

  return (
    <Phase name="test-phase">
      <Step name="test-step">
        <Claude
          model="haiku"
          maxTurns={1}
          allowedTools={[]}
          onFinished={(r) => {
            console.log("Claude finished!", r.output?.slice(0, 100));
            signalOrchestrationCompleteByToken(orchestrationToken);
          }}
          onError={(e) => {
            console.log("Claude error!", e.message);
            signalOrchestrationCompleteByToken(orchestrationToken);
          }}
        >
          Say "Hello from Phase/Step" and nothing else.
        </Claude>
      </Step>
    </Phase>
  );
}

function App() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph
        id="test"
        condition={() => true}
        maxIterations={1}
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

console.log("Plan:", root.toXML());
console.log("State:", JSON.stringify(db.state.getAll(), null, 2));

try {
  await Promise.race([
    orchestrationPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 60s")), 60000))
  ]);
  console.log("=== SUCCESS ===");
} catch (err) {
  console.error("=== FAILED ===", err);
} finally {
  root.dispose();
  db.close();
}
