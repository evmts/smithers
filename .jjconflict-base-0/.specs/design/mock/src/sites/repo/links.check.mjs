/* Built catalog link contract. Happy DOM only; browser layout belongs to the orchestrator. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(require.resolve('happy-dom'))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export const linkFaults = document => [...document.querySelectorAll('a')].flatMap(link => {
  const href = link.getAttribute('href')?.trim()
  if (!href || href === '#') return [`dead href: ${link.textContent.trim()}`]
  if (/^(?:https?:)?\/\//i.test(href) && (link.target !== '_blank' || !link.rel.split(/\s+/).includes('noopener'))) return [`external must use target=_blank rel=noopener: ${href}`]
  return []
})
// Prove both failure classes independently, including protocol-relative URLs.
const probe = new Window()
for (const markup of ['<a href="">Empty</a>', '<a href="#">Hash</a>', '<a>No href</a>', '<a href="https://github.com/a/b">External</a>', '<a href="//github.com/a/b" target="_blank">No rel</a>']) {
  probe.document.body.innerHTML = markup
  assert.equal(linkFaults(probe.document).length, 1, markup)
}
probe.document.body.innerHTML = '<a href="https://github.com/a/b" target="_blank" rel="noopener noreferrer">Safe</a><a href="#/a/b">Internal</a>'
assert.deepEqual(linkFaults(probe.document), [])
await probe.happyDOM.abort()
const faults = []
for (const site of ['default', 'smithers-site', 'effeck-site', 'effect']) {
 const window = new Window({url:'http://localhost/?still=1', width:390, height:844})
 try {
  window.document.body.innerHTML = '<div id="root"></div>'
  const html = readFileSync(`${root}/dist-codex/${site}/index.html`, 'utf8')
  window.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()')
  await pause(100)
  for (const screen of window.__SITE__.screens) {
   window.location.hash = '#/'+screen.route
   await pause(50)
   faults.push(...linkFaults(window.document).map(fault=>`${site}/${screen.id}: ${fault}`))
  }
  console.log(`${site}: ${window.__SITE__.screens.length} screens / ${window.__SITE__.routes.length} routes checked`)
 } finally { await window.happyDOM.abort(); window.close() }
}
assert.deepEqual(faults, [], `Built catalog link violations:\n${faults.join('\n')}`)
console.log('PASS all built catalog links; empty/# href, external target and noopener regression probes')
