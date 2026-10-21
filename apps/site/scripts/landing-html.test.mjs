import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { landingCopy } from '../src/data/landingCopy.ts'

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const html = () => readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')

test('landing serves the copy file, the install command and the two buttons', () => {
  const page = html()
  const buttons = [...page.matchAll(/<a class="landing-button[^"]*" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => [label, href])
  assert.deepEqual(buttons, [
    [landingCopy.docs.label, '/docs/installation/'],
    [landingCopy.source.label, 'https://github.com/smithersai/smithers']
  ])
  assert.doesNotMatch(page, /Sign in|\/api\/auth\//)
  assert.doesNotMatch(page, /coding guide|change-code\.md|npm i -g/)
  assert.match(page, new RegExp(`<h1>${escape(landingCopy.headline)}</h1>`))
  assert.match(page, new RegExp(`class="landing-sub">${escape(landingCopy.tagline)}<`))
  // Static HTML shows npx; bunx rides only on the switch the script reveals.
  assert.match(page, new RegExp(`<span id="run-command">${escape(landingCopy.commands.npx)}</span>`))
  assert.match(page, new RegExp(`id="copy-install" data-command="${escape(landingCopy.commands.npx)}"`))
  assert.match(page, />Copy</)
  const runner = page.match(/<div class="landing-runner" role="radiogroup" aria-label="([^"]+)" hidden>(.*?)<\/div>/s)
  assert.ok(runner, 'the runner switch is in the static page and starts hidden')
  assert.equal(runner[1], landingCopy.runnerLabel)
  const radios = [...runner[2].matchAll(/<input type="radio" name="runner" value="(\w+)" data-command="([^"]+)"( checked)?/g)].map(([, value, command, checked]) => [value, command, Boolean(checked)])
  assert.deepEqual(radios, [['npx', landingCopy.commands.npx, true], ['bunx', landingCopy.commands.bunx, false]])
  assert.equal(page.split(landingCopy.commands.bunx).length, 2, 'bunx appears once, as the switch value')
  assert.doesNotMatch(page, /<form|Explore|Smithers updates|couldn't load|Welcome to Smithers/)
})

test('the landing copy names the published CLI from the next tag for both runners', () => {
  for (const [runner, command] of Object.entries(landingCopy.commands)) {
    assert.match(command, new RegExp(`^${runner} smthrs@next `))
  }
  assert.equal(landingCopy.commands.npx.replace(/^npx/, 'bunx'), landingCopy.commands.bunx)
})
