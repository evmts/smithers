/* Stage 1 part C: actual built UI behavior and CSS contracts, without browser layout claims. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const w = new Window({ url: 'http://localhost/?still=1', width: 1440, height: 900 })
const wait = (ms = 130) => new Promise(resolve => setTimeout(resolve, ms))
const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)]
const member = 'as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const failures = []
let count = 0
const check = (value, message) => { count++; if (!value) failures.push(message) }
const before = (a, b) => Boolean($(a)?.compareDocumentPosition($(b)) & w.Node.DOCUMENT_POSITION_FOLLOWING)
const scrolls = []
w.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this) }
const open = async path => { scrolls.length = 0; w.location.hash = '#/smithers.sh/' + path; await wait() }
const screen = async id => {
  const item = w.__SITE__.screens.find(item => item.id === id)
  assert.ok(item, `Retained screen ${id}`)
  scrolls.length = 0; w.location.hash = '#/' + item.route; await wait()
}
const click = async selector => { const node = $(selector); check(node, `Click target ${selector}`); node?.click(); await wait() }
const change = async (selector, value) => {
  const node = $(selector); assert.ok(node, selector)
  const prototype = node.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value)
  node.dispatchEvent(new w.Event('input', { bubbles: true })); await wait()
}
try {
  const buildDir = process.argv.find(value => value.startsWith('--build='))?.slice(8) ?? 'dist-codex/default'
  const html = readFileSync(resolve(root, buildDir, 'index.html'), 'utf8')
  w.document.body.innerHTML = '<div id="root"></div>'
  w.document.head.innerHTML = [...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x => x[0]).join('')
  w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()'); await wait()
  for (const width of [1440, 390]) {
    w.happyDOM.setViewport({ width, height: width === 390 ? 844 : 900 })
    await screen('code-home-guest-limit')
    check(!$('.repo-frame-send'), 'C2: capped visitor cannot send')
    check($('.repo-frame-composer .repo-ui-btn-primary')?.textContent === 'Sign in with GitHub', 'C2: cap has primary sign-in')
    check($$('#repo-ask-panel [title="/signin"]').length === 1, 'C2: one sign-in action in capped Ask')
    await change('#repo-ask-input', 'Keep this draft through sign-in')
    const signIn = $('.repo-frame-composer [title="/signin"]')
    if (signIn) {
      const back = new URLSearchParams(signIn.getAttribute('href').split('?')[1]).get('return')
      check(new URLSearchParams(back.split('?')[1]).get('askDraft') === 'Keep this draft through sign-in', 'C2: authentication retains exact draft')
    }
    const messageCount = $$('.repo-frame-message-you').length
    $('#repo-ask-input').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wait()
    check($$('.repo-frame-message-you').length === messageCount && $('#repo-ask-input').value === 'Keep this draft through sign-in', 'C2: Enter cannot discard capped draft or submit')
    if (signIn) {
      await click('.repo-frame-composer [title="/signin"]')
      await click('.front-signin-actions .front-btn-primary')
      check($('#repo-ask-input')?.value === 'Keep this draft through sign-in' && $('.repo-frame-send'), 'C2: explicit authorization restores the draft and sending')
    }
    await screen('history-terminal-empty')
    check($('.repo-history-missing-sha')?.textContent === 'main', 'C5: missing terminal names requested branch')
    check($('.repo-frame-state a[title="/branches"]:not(.repo-ui-btn-primary)')?.textContent === 'Open branches', 'C5: missing terminal has recovery')
    await screen('pulls-files-empty')
    check($('.repo-pulls-title') || $('.repo-pulls-title-row h1'), 'C10: empty Files retains PR title')
    check($('[aria-label="Pull request"] [aria-current="page"]')?.textContent.includes('Files changed'), 'C10: empty Files retains active tabs')
    check($('#repo-content').textContent.includes('No changed files') && !$('#repo-content').textContent.includes('Pull request not found'), 'C10: only file evidence is empty')
    await screen('runs-run-cancelled')
    check(!$('.repo-runs-stage-strip .repo-ui-state-queued'), 'C11: cancelled run has no queued downstream stages')
    check($('.repo-runs-stage-strip')?.textContent.includes('Skipped — run cancelled'), 'C11: unexecuted stages explicitly skipped')
    check(!$('.repo-runs-details')?.open, 'C23: metadata starts collapsed')
    check(before('.repo-runs-stage-strip', '.repo-runs-details'), 'C23: stage progress precedes metadata')
    await screen('flows-reader')
    check(!$$('button').some(x => x.textContent.trim() === 'Run this flow'), 'C12: reader has no active Run button')
    check($('[title="/repo.request-access"].repo-ui-btn-primary'), 'C12: reader has primary Request access')
    await open(`maya/tinyhttp/flows/implement-issue?${member.replace("role=member", "role=reader")}&run=1`)
    check(!$('.repo-flows-run-card'), 'C12: direct run route cannot expose reader run form')
    await screen('settings-sync-error')
    check($('.repo-frame-sync-error svg'), 'C13: sync error chrome has failure icon')
    check($('.repo-frame-last-sync')?.textContent.includes('Last success'), 'C13: sync error keeps last-success metadata')
    check($('.repo-settings-content a.repo-ui-btn-primary')?.textContent.includes('Reinstall the GitHub App'), 'C13: 401 recovery promotes reinstall')
    check(!$('.repo-settings-content [title="/retry"]')?.classList.contains('repo-ui-btn-primary'), 'C13: Retry remains secondary')
    for (const [id, selector] of [['issues-detail-repro-confirm', '.repo-issues-confirm'], ['pulls-conversation-merge-confirm', '.repo-pulls-form-card']]) {
      await screen(id)
      check($(selector) && scrolls.includes($(selector)), `${id}: invoked confirmation is revealed`)
      check(Boolean($('.repo-frame-ask')) === (width >= 1440), `${id}: Ask docks beside confirmation at 1440 and closes below it`)
      if (id.includes('merge')) check($(selector)?.textContent.includes('maya will merge #35 into main'), 'C8: confirmation names person, PR and branch')
    }
    await screen('settings-models-connect-codex')
    check(before('.repo-settings-form-card', '.repo-settings-models'), 'C30: active connection form precedes provider cards')
    for (const id of ['settings-members-empty', 'settings-environments-empty', 'settings-webhooks-empty']) {
      await screen(id)
      for (const pane of $$('.repo-settings-content .repo-ui-box > .repo-frame-state')) {
        check(w.getComputedStyle(pane).borderTopWidth === '0px', `${id}: empty region has one border`)
        check(w.getComputedStyle(pane).borderRadius === '0px', `${id}: empty region has one radius`)
      }
    }
    await screen('wiki-preview')
    check(before('.repo-wiki-editor-toolbar', '.repo-wiki-preview'), 'C26: Save/Cancel precede preview')
    check($('.repo-wiki-editor-toolbar [title="/wiki.save"].repo-ui-btn-primary'), 'C26: preview has primary Save')
    await screen('wiki-proposal')
    check(!$('.repo-wiki-proposal [title^="/wiki.accept"]')?.classList.contains('repo-ui-btn-primary'), 'C27: pending proposal Accept is outline')
    check($('[title="/wiki.edit"]')?.classList.contains('repo-ui-btn-primary'), 'C27: Edit or ask is primary with a pending proposal')
    await screen('code-blob-todo')
    check($('.repo-code-dialog [title="/todo.create"].repo-ui-btn-primary'), 'C18: TODO has primary Create')
    await screen('code-blob-reader')
    check($('.repo-code-dialog [title="/repo.request-access"].repo-ui-btn-primary'), 'C19: reader dialog has primary Request access')
    await screen('history-commit-human')
    check(!$('.repo-history-more-branches')?.open && $('.repo-history-more-branches summary')?.textContent === '7 more branches', 'C20: long branch list starts collapsed')
    if (width === 390) check($('.repo-history-branches-desktop') && w.getComputedStyle($('.repo-history-branches-desktop')).display === 'none', 'C20: phone does not repeat expanded desktop branches')
  }
  await screen('runs-run-cancel-confirm')
  await click('.repo-runs-confirm .repo-ui-btn-primary')
  check(!$('.repo-runs-stage-strip .repo-ui-state-queued'), 'C11: live cancellation settles downstream stages')
  const savedRuns = JSON.parse(w.sessionStorage.getItem('repo-runs:maya/tinyhttp') || '{}').runs || {}
  const cancelled = Object.values(savedRuns).find(run => run.state === 'cancelled')
  check(cancelled && cancelled.stages.every(stage => !['queued', 'running', 'waiting'].includes(stage.state)), 'C11: persisted cancellation cannot schedule future work')
  await screen('code-home-effeck')
  const issues = JSON.parse(readFileSync(`${root}/src/sites/repo/fixtures/data/effeck__effeck/issues.json`, 'utf8'))
  for (const row of $$('.repo-code-home-fix')) {
    const n = Number(row.querySelector('a[href*="/issues/"]')?.textContent.slice(1))
    const issue = issues.find(x => x.n === n)
    check(issue?.state === 'closed' && issue.receipt?.landed, 'C3/C6: home fixes are closed with landed evidence')
    check(row.querySelector('time') && row.querySelector('a[href*="/commit/"] code')?.textContent === issue.receipt.landed.sha.slice(0, 7), 'C3: dated issue-to-SHA evidence')
  }
  await screen('issues-list-fixed-ignores-state')
  check(!$$('.repo-issues-list-row').some(row => row.querySelector('.repo-ui-state-open')), 'C6: closed filter never returns open fixes')
  await open(`maya/tinyhttp/issues?${member}&q=is:fixed-by-agents%20is:open`)
  check(!$('.repo-issues-list-row'), 'C6: contradictory open filter returns no closed fixes')
  for (const [id, title] of [['code-home-ask-copy-form', 'Copy'], ['code-home-ask-user-only', 'Change theme']]) {
    await screen(id)
    check($('.repo-frame-confirm .repo-ui-btn-primary')?.textContent === title, `C14: concrete primary ${title}`)
  }
  await screen('code-home-error')
  check($('[title="/retry"].repo-ui-btn-primary'), 'C14: read failure has primary Retry')
  await screen('releases-draft')
  check($('.repo-releases-draft-actions [type="submit"]') || $('.repo-releases-draft-actions button'), 'C28: draft has a persistent action footer')
  await change('#repo-releases-new-tag', 'v9.9.9')
  await change('#repo-releases-title', 'Publication test')
  await change('#repo-releases-notes', 'Human-reviewed release notes.')
  $('.repo-releases-draft-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait()
  check($('.repo-releases-draft-actions')?.textContent.includes('maya will publish v9.9.9'), 'C28: human publication confirmation precedes write')
  check(!w.sessionStorage.getItem('repo-releases-local:maya/tinyhttp'), 'C28: no publication before confirmation')
  if ($('.repo-releases-draft-actions [title="/release.publish.cancel"]')) {
    await click('.repo-releases-draft-actions [title="/release.publish.cancel"]')
    check($('#repo-releases-notes')?.value === 'Human-reviewed release notes.', 'C28: cancel retains draft')
    $('.repo-releases-draft-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait()
    await click('.repo-releases-draft-actions [title^="/release.publish.confirm"]')
    check($('#repo-content').textContent.includes('Publication test') && !$('.repo-releases-draft'), 'C28: person confirms publication')
  }
  if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length}/${count} part C regressions failed`) }
  console.log(`PASS qa1c: ${count} built UI assertions at desktop/390px settings`)
} finally { await w.happyDOM.abort(); w.close() }
