import assert from 'node:assert/strict'
import { markdownTables } from './markdown-tables.ts'
const tables = []
const render = source => { tables.length = 0; return markdownTables(source, table => { tables.push(table); return '<table>' }) }
assert.equal(render('Intro\n\n| A | B |\n| :--- | ---: |\n| **bold** | `x \\| y` |\n\nAfter'), 'Intro\n\n<table>\n\nAfter')
assert.deepEqual(tables[0], { headers: ['A', 'B'], align: ['left', 'right'], rows: [['**bold**', '`x | y`']] })
render('A | B | C\n--- | :---: | ---\none | two\none | two | three | ignored')
assert.deepEqual(tables[0].rows, [['one', 'two', ''], ['one', 'two', 'three']])
assert.equal(tables[0].align[1], 'center')
for (const fence of ['```', '````', '~~~']) {
 const source = `${fence}md\n| A | B |\n| --- | --- |\n| x | y |\n${fence}`
 assert.equal(render(source), source)
 assert.equal(tables.length, 0)
}
for (const source of ['A | B\n--- | nope', 'A | B\n---', 'ordinary | prose', '| A | B |\n| --- | --- | --- |']) {
 assert.equal(render(source), source)
 assert.equal(tables.length, 0)
}
render('| A | B |\n| --- | --- |\n| x\\\\| y |')
assert.deepEqual(tables[0].rows, [['x\\\\', 'y']])
render('| A | B |\n| --- | --- |\n\n| C | D |\n| --- | --- |')
assert.equal(tables.length, 2)
assert.deepEqual(tables.map(t => t.rows), [[], []])
console.log('PASS GFM tables: alignment, escaped pipes, inline source, short/long rows, empty bodies, malformed input, backtick/tilde fences and multiple tables')
