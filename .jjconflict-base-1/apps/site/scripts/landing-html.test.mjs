import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const action = process.env.SMITHERS_LANDING_TEST_ACTION ?? 'install'

test('landing serves the pinned install copy and only its chosen action', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
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
  assert.match(html, /href="\/docs\/installation\/"/)
  assert.match(html, /href="https:\/\/github.com\/smithersai\/smithers"/)
  assert.doesNotMatch(html, /<form|Explore|Smithers updates|couldn't load|Welcome to Smithers/)
})
