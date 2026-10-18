/* README, docs and wiki all use the same safe table renderer. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const req = createRequire(resolve(root, '../../../apps/app/package.json'))
const temp = mkdtempSync(join(tmpdir(), 'dl-final-md-'))
const { Window } = await import(req.resolve('happy-dom'))
const w = new Window({ url: 'http://localhost/' })
globalThis.window = w
globalThis.document = w.document
try {
 const bundle = await req('esbuild').build({
  stdin: {
   contents: `import {renderToStaticMarkup} from 'react-dom/server';
    import {Markdown} from './src/sites/repo/ui/Markdown';
    export const render = (source,base) => renderToStaticMarkup(Markdown({source,base}));`,
   resolveDir: root, sourcefile: 'markdown-check.tsx', loader: 'tsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  nodePaths: [resolve(root, '../../../apps/app/node_modules'), resolve(root, '../../../node_modules')]
 })
 const output = join(temp, 'check.cjs')
 writeFileSync(output, bundle.outputFiles[0].text)
 const { render } = req(output)
 const source = ['| Name | Value |', '| --- | --- |', '| **Bold** | `x \\| y` |', '| [Read](guide.md) | <script>alert(1)</script> |'].join('\n')
 for (const base of ['', 'docs', 'wiki']) {
  const html = render(source, base)
  assert.match(html, /<table>/)
  assert.match(html, /<th scope="col"/)
  assert.match(html, /<strong>Bold<\/strong>/)
  assert.match(html, /<code>x \| y<\/code>/)
  assert.match(html, /href="#\/smithers.sh\//)
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<p><div'))
  assert.match(html, /repo-ui-markdown-table/)
 }
 for (const kind of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
  const html = render(`> [!${kind}]\n> **Body** with [a link](guide.md).\n>\n> Second paragraph.`, '')
  w.document.body.innerHTML = html
  const alert = w.document.querySelector(`aside[data-kind="${kind.toLowerCase()}"]`)
  assert.ok(alert, `${kind}: semantic alert block`)
  assert.equal(alert.querySelector('.repo-ui-markdown-alert-label').textContent, kind[0] + kind.slice(1).toLowerCase())
  assert.equal(alert.querySelector('svg').getAttribute('width'), '16')
  assert.equal(alert.querySelector('svg').getAttribute('height'), '16')
  assert.ok(alert.querySelector('svg path'))
  assert.equal(alert.querySelectorAll('p').length, 2)
  assert.ok(alert.querySelector('p strong') && alert.querySelector('a'))
  assert.ok(!alert.textContent.includes('[!'))
 }
 for (const fence of ['```', '~~~']) {
  const html = render(`${fence}md\n> [!WARNING]\n> Literal example\n${fence}`, '')
  assert.ok(!html.includes('repo-ui-markdown-alert'))
  w.document.body.innerHTML = html
  assert.ok(w.document.body.textContent.includes('[!WARNING]'))
 }
 for (const language of ['vibe', 'effeck']) {
  const code = 'Console.log("Effeck was the original name")'
  w.document.body.innerHTML = render('```' + language + '\n' + code + '\n```', '')
  assert.equal(w.document.querySelector('.repo-docs-code-toolbar').textContent, 'VibeLang')
  assert.equal(w.document.querySelector('pre code').textContent.trimEnd(), code, 'Historical fenced source remains verbatim')
 }
 assert.ok(!render('> [!UNKNOWN]\n> Ordinary quote', '').includes('repo-ui-markdown-alert'))
 assert.ok(!render('[!WARNING] plain text', '').includes('repo-ui-markdown-alert'))
 assert.match(render('> [!TIP] Same-line body', ''), /Same-line body/)
 const css = readFileSync(resolve(root, 'src/sites/repo/ui/ui.css'), 'utf8')
 assert.match(css, /border-left: 1px solid var\(--repo-alert-color\)/)
 for (const token of ['info', 'success', 'brand', 'warning', 'danger']) assert.ok(css.includes(`--repo-alert-color: var(--${token})`))
 for (const path of ['views/code-home/CodeHome.tsx', 'views/wiki/Wiki.tsx', 'views/docs/Docs.tsx']) {
  assert.match(readFileSync(resolve(root, 'src/sites/repo', path), 'utf8'), /<Markdown source=/)
 }
 console.log('PASS shared rendered Markdown: README/docs/wiki semantic tables, inline code/strong/links, safe HTML and valid blocks')
} finally {
 rmSync(temp, { recursive: true, force: true })
 await w.happyDOM.close()
}
