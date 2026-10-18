// Real view interactions in happy-dom; no browser or new dependencies.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../../..')
const requireApp = createRequire(join(root, 'apps/app/package.json'))
const { Window } = await import(requireApp.resolve('happy-dom'))
const window = new Window({ url: 'https://mock.test/?still=1' })
for (const key of ['window', 'document', 'navigator', 'sessionStorage', 'localStorage', 'history', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FormData', 'CSS']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true })
}
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.MessageChannel = class { port1 = { onmessage: null }; port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) } }
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let copied
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { copied = value } }, configurable: true })
window.HTMLElement.prototype.scrollIntoView = function () {}
const artifacts = mkdtempSync(join(tmpdir(), 'c1-checklist-'))
const output = join(artifacts, 'check.cjs')
const bundle = await requireApp('esbuild').build({
  stdin: { contents: `
    import React, {act} from 'react'
    import {createRoot} from 'react-dom/client'
    import {MockProvider,DEFAULTS} from './.specs/design/mock/src/sites/core/mock'
    import {setRoutes,resolveRoute,useLocation,navigate} from './.specs/design/mock/src/sites/core/router'
    import {repoRoutes} from './.specs/design/mock/src/sites/repo/routes'
    import * as fixture from './.specs/design/mock/src/sites/repo/fixtures'
    import {getSlash,parseSlash,missingSlashFields} from './.specs/design/mock/src/sites/repo/frame/slash'
    import {buttonCommand} from './.specs/design/mock/src/sites/repo/views/checklist/ViewFrame'
    import {startFlowRun} from './.specs/design/mock/src/sites/repo/views/flows/actions'
    import {makeCodeTodo,makeTodo,allIssues} from './.specs/design/mock/src/sites/repo/views/issues/model'
    setRoutes(repoRoutes)
    const Page=()=>{const match=resolveRoute(useLocation());return match?match.route.render(match.context):<p>No matching route</p>}
    export {React,act,createRoot,MockProvider,DEFAULTS,Page,fixture,getSlash,parseSlash,missingSlashFields,navigate,buttonCommand,startFlowRun,makeCodeTodo,makeTodo,allIssues,repoRoutes}
  `, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  nodePaths: [join(root, 'apps/app/node_modules'), join(root, 'node_modules')]
})
writeFileSync(output, bundle.outputFiles[0].text)
const m = createRequire(import.meta.url)(output)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const qs = selector => document.querySelector(selector)
const all = selector => [...document.querySelectorAll(selector)]
const content = () => qs('#repo-content')?.textContent ?? ''
let app
let count = 0
const check = (value, message) => { assert.ok(value, message); count++ }
const mount = async (path, flags = {}, slug = 'maya/tinyhttp', clear = true) => {
  if (app) await m.act(async () => app.unmount())
  if (clear) sessionStorage.clear()
  sessionStorage.setItem('repo-ask-open', 'false')
  sessionStorage.setItem('site-mock-flags', JSON.stringify({...m.DEFAULTS, as:'in', role:'member', host:'install', landing:'open', ...flags}))
  window.location.hash = `#/smithers.sh/${slug}/${path}`
  await wait(2)
  document.body.innerHTML = '<div id="root"></div>'
  app = m.createRoot(qs('#root'))
  await m.act(async () => { app.render(m.React.createElement(m.MockProvider, null, m.React.createElement(m.Page))); await wait(4) })
}
const click = async element => {
  check(element, 'Click target exists')
  await m.act(async () => { element.click(); await wait(4) })
}
const slash = async line => {
  const {name,values} = m.parseSlash(line)
  const command = m.getSlash(name)
  check(command, `Registered ${name}`)
  check(!m.missingSlashFields(command, values).length, `Arguments are valid: ${line}`)
  const flags = JSON.parse(sessionStorage.getItem('site-mock-flags'))
  await m.act(async () => { await command.run(values, {flags,location: window.location.hash.slice(2),closeAsk(){}}); await wait(5) })
}
const commandCoverage = () => {
  for (const element of all('#repo-content button[title], #repo-content summary[title], #repo-content a[title], #repo-content input[type=checkbox][title]')) {
    const command = m.buttonCommand(element.title)
    if (command) check(m.getSlash(command.name), `Slash door for ${element.title}`)
  }
}
try {
  console.log('Checking ref rewrites and pinned permalinks')
  for (const family of ['tree', 'blob', 'blame', 'commits']) {
    const suffix = family === 'tree' ? '/src' : '/src/router.ts'
    await mount(`${family}/main${suffix}?L=4&author=smithers-agent`)
    const branch = m.fixture.branches.find(item => item.name.includes('/'))
    await slash(`/branch.switch ${branch.name}`)
    check(window.location.hash.includes(`/${family}/${encodeURIComponent(branch.name)}${suffix}`), `${family} keeps path and selected branch`)
    check(window.location.hash.includes('author=smithers-agent'), `${family} keeps query`)
    check(qs('summary[title="/branch.switch"]').textContent.includes(branch.name), `${family} shows selected branch`)
  }
  await mount('blame/main/src/router.ts?prior=1')
  await slash('/branch.switch main')
  check(qs('.repo-code-blame-range'), 'Switching away from prior blame clears its historical-snapshot request')
  await mount('blob/main/src/router.ts?L=4')
  await slash('/ref.list tags')
  check(qs('.repo-ui-branch-menu').parentElement.open, 'Ref slash opens picker')
  const tag = m.fixture.tags[0]
  await slash(`/branch.switch ${tag.name}`)
  await slash('/file.permalink')
  check(copied.includes(`/blob/${tag.sha}/src/router.ts#L4`), 'Tag permalink pins its head SHA')
  check(qs('.repo-code-toolbar-link').getAttribute('href').includes(`/commits/${tag.name}/`), 'History follows tag')
  await slash('/file.view raw src/router.ts')
  check(qs('.repo-code-raw'), 'File view slash activates same raw control')
  await slash('/file.copy src/router.ts')
  check(copied === m.fixture.file('src/router.ts').content, 'File copy slash copies contents')

  console.log('Checking missing content in each product dataset')
  for (const slug of ['smithers-canary/smithers', 'effeck/effeck', 'Effect-TS/effect']) {
    m.fixture.selectRepo(slug)
    const entry = m.fixture.tree.find(item => item.kind === 'file' && !m.fixture.file(item.path))
    if (!entry) {
      check(m.fixture.tree.filter(item => item.kind === 'file').every(item => m.fixture.file(item.path)), `${slug} now includes every listed file`)
      continue
    }
    await mount(`blob/main/${entry.path}`, {as:'out'}, slug)
    check(qs('[data-mock="missing-file-contents"]')?.textContent === "This file's contents aren't part of the mock.", `${slug}: truthful omitted contents`)
    check(content().includes(entry.path.split('/').at(-1)), 'File header remains')
    check(qs('.repo-code-latest'), 'Last commit remains')
    check(all('.repo-code-file-toolbar a').some(a => a.textContent === 'History'), 'History link remains')
    await click(all('.repo-code-file-toolbar a').find(a => a.textContent === 'Raw'))
    check(qs('[data-mock]'), 'Raw missing content stays truthful')
    await mount(`blob/main/${entry.path}`, {data:'empty'}, slug)
    check(content().includes('This file is empty.'), 'Missing-content file still honors empty flag')
    check(!qs('.repo-code-sidebar'), 'Empty file hides fixture tree')
  }

  await mount('blob/main/no-such-file.ts', {data:'empty'})
  check(content().includes('No no-such-file.ts at main'), 'Absent paths remain not found under the empty flag')
  console.log('Checking every read family and their state flags')
  const reads = [
    ['tree/main/src','repo-code-file-row'], ['blob/main/src/router.ts','repo-code-source'],
    ['blame/main/src/router.ts','repo-code-blame-range'], ['commits/main','repo-history-commit-row'],
    ['commit/a41c9e0','repo-history-commit-header'], ['branches','repo-history-branch-row'], ['tags','repo-history-tag-row'],
    ['issues','repo-issues-list-row'], ['issues/33','repo-issues-detail'], ['pulls','repo-pulls-list-row'],
    ['pull/34','repo-pulls-detail-header'], ['pull/34/files','repo-pulls-diff-lines'],
    ['pull/34/checks','repo-pulls-check-detail'], ['pull/34/commits','repo-pulls-commit-row'],
    ['stack','repo-pulls-stack-list'], ['runs','repo-runs-list-row'], ['runs/run-511','repo-runs-detail'],
    ['flows','repo-flows-list-row'], ['flows/implement-issue','repo-flows-overview'], ['agents','repo-flows-agent-card'],
    ['wiki','repo-wiki-body'], ['wiki/Home','repo-wiki-body'], ['docs','repo-docs-article'], ['docs/routing','repo-docs-article'], ['releases','repo-releases-entry'], ['releases/tag/v0.4.2','repo-releases-entry'], ['search?q=router','repo-search-code-result']
  ]
  for (const [path, expected] of reads) {
    await mount(path, {as:'out'})
    check(qs(`.${expected}`), `${path} shows its subject signed out`)
    check(!content().includes('No matching route'), `${path} resolves signed out`)
    // Anatomy varies between families; the explicit subject must occupy the main view.
    check(qs('#repo-content') && !qs('#repo-content .repo-home'), `${path} is maximized`)
    check(!content().includes('Sign in to open the Stack'), `${path} has no public read wall`)
    commandCoverage()
    await mount(path, {net:'slow'})
    check(qs('.repo-frame-loading'), `${path} starts loading`)
    await mount(path, {net:'error'})
    check(qs('[role=alert]') && all('#repo-content button').some(button => button.textContent === 'Retry'), `${path} gives reason and Retry`)
    commandCoverage()
    await mount(path, {data:'empty'})
    check(!qs(`.${expected}`) || path === 'branches' && all('.repo-history-branch-row').length === 1 && content().includes('Only the default branch.'), `${path} hides loaded content when empty`)
  }
  for (const section of ['general','members','models','secrets','environments','sandboxes','triggers','webhooks','sync','reporting']) {
    const path = `settings/${section}`
    await mount(path)
    check(qs('.repo-settings-heading'), `${path} shows configuration`)
    commandCoverage()
    await mount(path, {net:'slow'})
    check(qs('.repo-frame-loading'), `${path} starts loading`)
    await mount(path, {net:'error'})
    check(qs('[role=alert]'), `${path} shows failure`)
    await mount(path, {data:'empty'})
    check(!qs('.repo-frame-loading') && !qs('[role=alert]'), `${path} has an empty/default configuration`)
    commandCoverage()
  }
  for (const path of ['evals', 'evals/agent']) {
    const slug = 'smithers-canary/smithers'
    await mount(path, {as:'out'}, slug)
    check(qs(path === 'evals' ? '.repo-evals-list-row' : '.repo-evals-suite'), `${path} is public`)
    commandCoverage()
    await mount(path, {net:'slow'}, slug)
    check(qs('.repo-frame-loading'), `${path} starts loading`)
    await mount(path, {net:'error'}, slug)
    check(qs('[role=alert]'), `${path} shows failure`)
    await mount(path, {data:'empty'}, slug)
    check(!qs('.repo-evals-list-row') && !qs('.repo-evals-suite'), `${path} shows empty state`)
  }
  for (const path of ['approvals','branches/main/terminal']) {
    await mount(path)
    commandCoverage()
    await mount(path, {net:'slow'})
    check(qs('.repo-frame-loading'), `${path} starts loading`)
    await mount(path, {net:'error'})
    check(qs('[role=alert]'), `${path} shows failure`)
    await mount(path, {data:'empty'})
    check(qs('.repo-frame-state'), `${path} shows empty state`)
  }
  await mount('issues/33', {net:'error'})
  await slash('/retry')
  check(qs('.repo-issues-detail'), 'Retry command repairs actual read')
  await mount('issues/33', {net:'slow'})
  await m.act(async () => wait(1550))
  check(qs('.repo-issues-detail'), 'Slow detail resolves to ready')

  console.log('Checking forms, slash parity, permissions, and local writes')
  await mount('issues/33?ask=%2Fissue.edit%2033')
  check(qs('#repo-issues-edit-title'), 'Typing the edit slash in Ask executes the registered view action')
  await slash('/cancel')
  await slash('/issue.edit 33')
  check(qs('#repo-issues-edit-title'), 'Edit slash opens existing issue form')
  await slash('/cancel')
  check(!qs('#repo-issues-edit-title'), 'Cancel slash closes form')
  await slash('/files')
  check(window.location.hash.split('?')[0] === '#/smithers.sh/maya/tinyhttp', 'Files slash from an issue opens the repository file tree')
  await mount('issues/new')
  await slash('/issue.new template:bug')
  check(qs('button[title="/issue.new template:bug"]').getAttribute('aria-pressed') === 'true', 'Template slash selects bug form')
  await slash('/issue.preview repo-issues-new-body')
  check(qs('.repo-issues-preview'), 'Preview slash uses actual markdown state')
  await mount('pulls')
  check(all('.repo-pulls-meta a').some(link => link.textContent === 'Review receipt'), 'Pull list links the recorded review receipt')
  await mount('pull/34')
  await slash('/pull.assign 34')
  check(content().includes('Assign this pull request'), 'Assignment slash opens form')
  commandCoverage()
  await mount('pull/34', {role:'reader'})
  check(!m.getSlash('pull.edit'), 'Reader has no registered Edit write action')
  check(!qs('[title="/pull.edit 34"]'), 'Reader has no Edit write control')
  check(!qs('#repo-pulls-edit-title'), 'Reader has no edit fields')
  await mount('flows/implement-issue?run=1', {role:'reader'})
  check(content().includes('Only members') && !content().includes('Start this run?'), 'Reader cannot run flow')
  await mount('branches/main/terminal', {role:'reader'})
  check(content().includes('Only members'), 'Terminal denies reader')
  await mount('settings', {role:'reader'})
  check(content().includes('Only members'), 'Settings denies reader')
  await mount('flows/implement-issue?run=1', {host:'hosted',landing:'install'})
  check(content().includes('Hosted runs that change code'), 'Hosted code-changing flow held with reason')
  await mount('settings/models', {host:'hosted',landing:'install'})
  check(content().includes('hosted') || content().includes('Hosted'), 'Models held with reason')
  commandCoverage()

  await mount('blob/main/src/router.ts?L=40-52&todo=1')
  await slash('/todo.create')
  check(qs('.repo-code-todo-toast'), 'Code TODO slash submits the actual form')
  await mount('stack', {}, 'maya/tinyhttp', false)
  check(content().includes('src/router.ts:40-52'), 'Code TODO is present after navigating to Stack')
  await mount('issues/33?act=implement', {host:'install',landing:'install',hosted:'paused'})
  check(qs('button[title="/issue.implement.start 33"]'), 'Hosted capability flags do not block local issue runs')
  await slash('/issue.implement.start 33')
  check(qs('.repo-runs-detail') && content().includes('Implement #33'), 'Issue start slash launches a resolvable run')
  await mount('stack')
  // A saved order must still acquire newly created issue/code TODOs.
  sessionStorage.setItem('repo-pulls-v1:maya/tinyhttp:stack', JSON.stringify(m.fixture.stack))
  const source = 'src/router.ts:40-52'
  let todo
  await m.act(async () => { todo = m.makeCodeTodo('Keep empty query values', source) })
  await mount('stack', {}, 'maya/tinyhttp', false)
  check(content().includes(todo.title), 'Code TODO survives a saved Stack order')
  const issue = m.allIssues().find(item => !item.todo && !m.fixture.stack.some(todo => todo.issue === item.n))
  check(issue, 'Issue without a TODO is available')
  await m.act(async () => m.makeTodo(issue))
  await mount('stack', {}, 'maya/tinyhttp', false)
  check(content().includes(issue.title), 'Issue TODO appears in saved Stack')
  await mount('issues?q=is:todo', {}, 'maya/tinyhttp', false)
  check(content().includes(issue.title), 'Issue TODO matches canonical filter')
  await mount('flows')
  let id
  await m.act(async () => { id = m.startFlowRun(m.fixture.flows[0], {issue:'33'}) })
  check(id, 'Flow creates a run')
  await mount(`runs/${id}`, {}, 'maya/tinyhttp', false)
  check(qs('.repo-runs-detail') && content().includes(id), 'New flow run resolves through run reader')
  commandCoverage()
  await mount('runs', {}, 'maya/tinyhttp', false)
  check(all('.repo-runs-row-title').some(link => link.getAttribute('href').endsWith(`/runs/${id}`)), 'New flow run also appears in Runs list')
  await mount('runs/run-511')
  const approval = m.fixture.approvals.find(item => item.run === 'run-511' && item.state === 'waiting')
  check(approval, 'Waiting run includes a real question')
  await slash(`/approval.answer ${approval.id} ${approval.options[0]}`)
  const confirm = all('.repo-runs-confirm button').find(button => button.textContent === 'Confirm decision')
  check(confirm, 'Decision confirmation is available')
  await slash(`/approval.answer.confirm ${approval.id} ${approval.options[0]}`)
  check(content().includes('Running') && !qs('.repo-runs-waiting-cards'), 'Human answer resumes canonical run')
  await mount('runs/run-512')
  const stage = m.fixture.run('run-512').stages[0]
  await slash(`/run.stage run-512 ${stage.id}`)
  check(qs('.repo-runs-log-heading h2')?.textContent === stage.label, 'Stage slash selects matching log')
  commandCoverage()
  await slash('/run.cancel run-512')
  await slash('/run.cancel.confirm run-512')
  check(content().includes('Run cancelled.'), 'Final cancel slash executes cancellation')
  check(!m.getSlash('pull.assign'), 'Detached view command cleaned up')
  const ids = m.repoRoutes.flatMap(route => route.screens.map(screen => screen.id))
  check(new Set(ids).size === ids.length, 'Screen ids are unique')
  console.log(`PASS ${count} checklist behavioral assertions`)
} finally {
  if (app) await m.act(async () => app.unmount())
  await window.happyDOM.close()
  rmSync(artifacts, {recursive:true,force:true})
}
