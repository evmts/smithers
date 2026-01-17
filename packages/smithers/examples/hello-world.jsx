#!/usr/bin/env bun
/**
 * Hello World - Smithers Example
 *
 * A simple example showing the Ralph Wiggum loop in action.
 * Ralph keeps going until all phases complete.
 */
import { createSignal } from '../src/index.js';
import { createSmithersRoot } from '../src/root.js';
import { Ralph } from '../src/components/Ralph.js';
import { Claude } from '../src/components/Claude.js';
import { Phase } from '../src/components/Phase.js';
import { serialize } from '../src/serialize.js';
function HelloRalph() {
    const [step, setStep] = createSignal(1);
    return (<Ralph maxIterations={5} onIteration={(i) => console.log(`\n=== Iteration ${i} ===\n`)}>
      <Phase name="demo">
        {step() === 1 && (<Claude model="claude-sonnet-4" onFinished={(result) => {
                console.log('Step 1 complete:', result);
                setStep(2);
            }}>
            Say hello to Ralph!
          </Claude>)}

        {step() === 2 && (<Claude model="claude-sonnet-4" onFinished={(result) => {
                console.log('Step 2 complete:', result);
                setStep(3);
            }}>
            Tell me a joke about programming
          </Claude>)}

        {step() === 3 && (<div>Done! Ralph went in a loop! "I'm going, I'm going!"</div>)}
      </Phase>
    </Ralph>);
}
// Run it
console.log('🎭 Smithers Hello World\n');
const root = createSmithersRoot();
root.mount(HelloRalph);
console.log('Initial plan:');
console.log(serialize(root.getTree()));
console.log('\n');
// Monitor state changes
let checkCount = 0;
const maxChecks = 20;
const interval = setInterval(() => {
    checkCount++;
    console.log(`\n[Check ${checkCount}] Current state:`);
    console.log(serialize(root.getTree()));
    if (checkCount >= maxChecks) {
        console.log('\n✅ Example complete!');
        clearInterval(interval);
        root.dispose();
        process.exit(0);
    }
}, 1000);
