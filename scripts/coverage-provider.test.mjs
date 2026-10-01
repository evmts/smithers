import assert from "node:assert/strict"
import { test } from "node:test"
import { ifCounts, measure } from "./fixtures/coverage-provider.mjs"

const source = `
type Input = { value?: boolean; stop?: boolean; abandon?: boolean };
function* delegate(value: boolean) { yield value; return value; }
export function* probe(input: Input) {
  if (input.stop) return 'before';
  const alive = input.value === undefined ? true : yield* delegate(input.value);
  if (alive) { return 'true'; }
  return 'false';
}
`
const driver = (inputs, output) =>
  `import { expect, test } from 'vitest';
import { probe } from './fixture.ts';
test('independent execution outcomes', () => {
  const results = ${JSON.stringify(inputs)}.map(input => {
    const iterator = probe(input);
    let step = iterator.next();
    if (input.abandon && !step.done) { iterator.return('cancelled'); return 'cancelled'; }
    while (!step.done) step = iterator.next();
    return step.value;
  });
  expect(results).toEqual(${JSON.stringify(output)});
});`

for (
  const scenario of [
    {
      name: "mixed direct and delegated",
      inputs: [{}, {}, { value: true }, { value: false }],
      output: ["true", "true", "true", "false"],
      counts: [3, 1]
    },
    { name: "true only", inputs: [{}, { value: true }], output: ["true", "true"], counts: [2, 0] },
    { name: "false only", inputs: [{ value: false }, { value: false }], output: ["false", "false"], counts: [0, 2] },
    {
      name: "all delegated",
      inputs: [{ value: true }, { value: true }, { value: true }, { value: false }],
      output: ["true", "true", "true", "false"],
      counts: [3, 1]
    },
    {
      name: "not reached after early exit",
      inputs: [{ stop: true }, { stop: true }],
      output: ["before", "before"],
      counts: [0, 0]
    },
    {
      name: "early exit mixed with reached condition",
      inputs: [{ stop: true }, {}, { value: false }],
      output: ["before", "true", "false"],
      counts: [1, 1]
    },
    {
      name: "abandoned generator before condition",
      inputs: [{}, { value: true, abandon: true }, { value: false }],
      output: ["true", "cancelled", "false"],
      counts: [1, 1]
    },
    {
      name: "only abandoned generators",
      inputs: [{ value: true, abandon: true }, { value: false, abandon: true }],
      output: ["cancelled", "cancelled"],
      counts: [0, 0]
    }
  ]
) {
  test(`Istanbul attributes exact branches: ${scenario.name}`, () => {
    const result = measure({ source, test: driver(scenario.inputs, scenario.output) })
    assert.equal(result.status, 0, result.output)
    assert.deepEqual(ifCounts(result.coverage, source, "  if (alive)"), scenario.counts)
  })
}

test("the unchanged 100% gate refuses an unexecuted else", () => {
  const fixture = `export function choose(value: boolean) { if (value) { return 'yes'; } return 'no'; }\n`
  const both = measure({
    source: fixture,
    test:
      `import {expect,test} from 'vitest';import {choose} from './fixture.ts';test('both',()=>{expect(choose(true)).toBe('yes');expect(choose(false)).toBe('no')});`,
    thresholds: 100
  })
  assert.equal(both.status, 0, both.output)
  assert.deepEqual(ifCounts(both.coverage, fixture, "if (value)"), [1, 1])
  const missing = measure({
    source: fixture,
    test:
      `import {expect,test} from 'vitest';import {choose} from './fixture.ts';test('true',()=>expect(choose(true)).toBe('yes'));`,
    thresholds: 100
  })
  assert.notEqual(missing.status, 0)
  assert.deepEqual(ifCounts(missing.coverage, fixture, "if (value)"), [1, 0])
  assert.match(missing.output, /Coverage for branches.*does not meet.*100%/)
})

test("counts a throwing true arm without mistaking the exception for a false branch", () => {
  const throwing = source.replace("return 'true';", "throw new Error('true');")
  const result = measure({
    source: throwing,
    test: `import {expect,test} from 'vitest';import {probe} from './fixture.ts';
test('throw and recovery',()=>{
  const results = [{},{value:true},{value:false}].map(input=>{
    const iterator=probe(input);try{let step=iterator.next();while(!step.done)step=iterator.next();return step.value;}catch(error){return error.message;}
  });expect(results).toEqual(['true','true','false']);
});`
  })
  assert.equal(result.status, 0, result.output)
  assert.deepEqual(ifCounts(result.coverage, throwing, "  if (alive)"), [2, 1])
})

test("does not count an abandoned yield inside the condition as either branch", () => {
  const conditional = `type Input={direct?:boolean;value?:boolean;abandon?:boolean};
function* delegate(value:boolean){yield value;return value;}
export function* probe(input:Input){
  if (input.direct ? true : yield* delegate(input.value!)) { return 'true'; }
  return 'false';
}`
  const result = measure({
    source: conditional,
    test: driver(
      [{ direct: true }, { value: true, abandon: true }, { value: false }],
      ["true", "cancelled", "false"]
    )
  })
  assert.equal(result.status, 0, result.output)
  assert.deepEqual(ifCounts(result.coverage, conditional, "  if (input.direct"), [1, 1])
})

test("attributes nested branches across skipped loops, repeated calls and reversed inputs", () => {
  const nested = `export function nested(values: boolean[], enter: boolean): string[] {
  const output: string[] = [];
  if (enter) {
    for (const alive of values) {
      if (alive) { output.push('true'); } else { output.push('false'); }
    }
  }
  return output;
}`
  const result = measure({
    source: nested,
    test: `import {expect,test} from 'vitest';import {nested} from './fixture.ts';
test('ordered calls',()=>{
expect(nested([true,false],false)).toEqual([]);
expect(nested([],true)).toEqual([]);
expect(nested([true,true,false],true)).toEqual(['true','true','false']);
expect(nested([false,true],true)).toEqual(['false','true']);
});`
  })
  assert.equal(result.status, 0, result.output)
  assert.deepEqual(ifCounts(result.coverage, nested, "  if (enter)"), [3, 1])
  assert.deepEqual(ifCounts(result.coverage, nested, "      if (alive)"), [3, 2])
})

test("remaps typed async and Effect generator branches to their original source locations", () => {
  const mapped = `import { Effect } from 'effect';
export async function asynchronous(value: boolean): Promise<string> {
  const alive: boolean = await Promise.resolve(value);
  if (alive) { return 'async-true'; }
  return 'async-false';
}
export function effectful(input: boolean | undefined) {
  return Effect.gen(function*(){
    const alive: boolean = input === undefined ? true : yield* Effect.succeed(input);
    if (alive) { return 'effect-true'; }
    return 'effect-false';
  });
}`
  const result = measure({
    source: mapped,
    test:
      `import {expect,test} from 'vitest';import {Effect} from 'effect';import {asynchronous,effectful} from './fixture.ts';
test('source mapped results',async()=>{
expect(await Promise.all([asynchronous(true),asynchronous(false),asynchronous(true)])).toEqual(['async-true','async-false','async-true']);
const results=[];for(const input of [undefined,undefined,true,false]) results.push(await Effect.runPromise(effectful(input)));
expect(results).toEqual(['effect-true','effect-true','effect-true','effect-false']);
});`
  })
  assert.equal(result.status, 0, result.output)
  assert.deepEqual(ifCounts(result.coverage, mapped, "  if (alive)"), [2, 1])
  assert.deepEqual(ifCounts(result.coverage, mapped, "    if (alive)"), [3, 1])
})

test("an exception before the condition contributes exactly zero branch entries", () => {
  const throwing = source.replace("if (input.stop) return 'before';", "if (input.stop) throw new Error('before');")
  const result = measure({
    source: throwing,
    test: `import {expect,test} from 'vitest';import {probe} from './fixture.ts';
test('early throw and subsequent calls',()=>{
const results=[{stop:true},{},{value:false}].map(input=>{try{const iterator=probe(input);let step=iterator.next();while(!step.done)step=iterator.next();return step.value;}catch(error){return error.message;}});
expect(results).toEqual(['before','true','false']);
});`
  })
  assert.equal(result.status, 0, result.output)
  assert.deepEqual(ifCounts(result.coverage, throwing, "  if (alive)"), [1, 1])
})
