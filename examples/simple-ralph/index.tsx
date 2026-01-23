#!/usr/bin/env smithers
/**
 * Simple Ralph - Minimal iterative workflow with PRD context
 *
 * Reads a PRD file and iterates with Codex until the task is complete.
 * Demonstrates the basic Ralph loop pattern.
 */

import { readFileSync } from "node:fs";
import { SmithersProvider } from "../../src/components/SmithersProvider.js";
import { Ralph } from "../../src/components/Ralph.js";
import { Codex } from "../../src/components/Codex.js";
import { createSmithersDB } from "../../src/db/index.js";
import { createSmithersRoot } from "../../src/reconciler/index.js";
import { useState } from "react";

const db = createSmithersDB();
const executionId = db.execution.start(
  "Simple Ralph",
  "simple-ralph/index.tsx",
);

const prd = readFileSync("./prd.md", "utf-8");

function SimpleRalph() {
  const [done, setDone] = useState(false);
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph id="simple-ralph" condition={() => !done} maxIterations={200}>
        <Codex
          model="o4-mini"
          fullAuto
          onFinished={(result) => {
            if (result.output?.includes("TASK_COMPLETE")) {
              setDone(true);
            }
          }}
        >
          {prd}
        </Codex>
      </Ralph>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
try {
  await root.mount(SimpleRalph);
  db.execution.complete(executionId, { summary: "Simple Ralph completed" });
} catch (err) {
  db.execution.fail(executionId, String(err));
  throw err;
} finally {
  db.close();
}
