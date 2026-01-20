#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, Phase, Step, Review, Claude } from 'smithers-orchestrator';

const db = createSmithersDB({ path: '.smithers/pr-review' });
const executionId = db.execution.start('PR Review', 'pr-review-workflow.tsx');

function Workflow() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
      <Phase name='Review PR'>
        <Step name='read'>
          <Claude>Read the PR description and changed files</Claude>
        </Step>
        <Step name='gate'>
          <Review target={{ type: 'diff', ref: 'main' }} criteria={['Correctness','Safety','Tests']} />
        </Step>
        <Step name='comment'>
          <Claude>Write review comments with suggested fixes</Claude>
        </Step>
      </Phase>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.mount(Workflow);
db.close();
