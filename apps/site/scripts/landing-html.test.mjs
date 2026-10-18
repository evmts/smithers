import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { landingCopy } from '../src/data/landingCopy.ts'

const action = process.env.SMITHERS_LANDING_TEST_ACTION ?? 'install'

test('landing serves the pinned install copy and only its chosen action', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
  assert.match(html, /href="\/docs\/installation\/"/)
  assert.ok(html.includes(`href="${landingCopy.source}"`))
  assert.doesNotMatch(html, /Coding agents that land changes on your repo|review it, and land it on GitHub/)
  if (action === 'open') {
    assert.match(html, /Coding agents for your GitHub repo/);
    assert.match(html, /<form[^>]*class="repository-launcher-open"/);
    assert.doesNotMatch(html, /id="copy-install"/);
    return
  }
  assert.match(html, /Durable agent coding on your own subscription\./)
  assert.match(html, /npm i -g smthrs@next/)
  assert.match(html, />Copy</)
  assert.match(html, /Then follow the coding guide/)
  assert.ok(html.includes(`href="${landingCopy.codingGuide}"`))
  assert.doesNotMatch(html, /<form|Explore|Smithers updates|couldn't load|Welcome to Smithers/)
})
