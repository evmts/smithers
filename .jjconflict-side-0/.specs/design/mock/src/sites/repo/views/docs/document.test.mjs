import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(new URL('../../../../../../package.json', import.meta.url))
const { build } = require('esbuild')
const dir = mkdtempSync(join(tmpdir(), 'repo-doc-blocks-'))
try {
 const out = join(dir, 'document.mjs')
 await build({ entryPoints: [fileURLToPath(new URL('./document.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' })
 const { documentBlocks } = await import(pathToFileURL(out).href)
 const code = source => documentBlocks(source).filter(b => b.kind === 'code')
 assert.deepEqual(code('> For agents\n>\n> ```text\n> Set up Effeck in this project.\n> ```\n> Continue here.'), [{kind:'code',lang:'text',text:'Set up Effeck in this project.'}])
 assert.deepEqual(code('> > ~~~ts\n> > const n = 1\n> > ~~~'), [{kind:'code',lang:'ts',text:'const n = 1'}])
 assert.deepEqual(code('````markdown\n```ts\nconst n = 1\n```\n````'), [{kind:'code',lang:'markdown',text:'```ts\nconst n = 1\n```'}])
 assert.deepEqual(code('```ts\n> comparison\n```'), [{kind:'code',lang:'ts',text:'> comparison'}])
 const blocks = documentBlocks('> ```text\n> command\n> ```\n\n## Next')
 assert.equal(blocks.at(-1).text, 'Next')
 console.log('PASS docs document: quoted/nested fences, longer delimiters, code bytes, following heading')
} finally { rmSync(dir, {recursive:true,force:true}) }
