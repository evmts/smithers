// App seam against the cloned Ops vault's separately running serve.
import { readFile, writeFile } from 'node:fs/promises'
import { startLocalServer } from '../server'
import { createGatewaySeam } from '../../mainview/state/controller/gateway'
import { LOCAL_SESSION_HEADER } from '@smthrs/rpc/LocalSession'
const root = '/tmp/ops-l7-e1-evidence'
const vault = '/tmp/ops-l7-e1-vault'
const token = (await readFile(`${root}/ask-serve.stderr`, 'utf8')).match(/approval token  (\S+)/)?.[1]
if (!token) throw new Error('clone serve not ready')
const health = await (await fetch('http://127.0.0.1:17491/health')).json() as any
const app = await startLocalServer({ distDir: `${root}/dist`, cloudMode: 'offline', stateDir: `${root}/identity-state`, localGateway: { url: 'http://127.0.0.1:17491', repo: 'local/ops-clone', workspaceId: health.workspaceHash, operatorToken: token } })
try {
  const seam = createGatewaySeam({ baseUrl: app.origin, bindingFor: () => ({ workspaceId: health.workspaceHash }),
    fetch: (url, init) => fetch(url, { ...init, headers: { ...init?.headers, [LOCAL_SESSION_HEADER]: app.sessionToken } }), errorMessageOf: async r => r.text() })
  const before = await seam.approvalsInbox('local/ops-clone')
  if (before.status !== 'ok' || before.value.length !== 1) throw new Error(JSON.stringify(before))
  const row = before.value[0]!
  await writeFile(`${root}/ask-approvals.json`, JSON.stringify(before, null, 2))
  const submitted = await seam.submitApproval('local/ops-clone', row.payload, 'approve', undefined, { choice: 'yes' })
  if (submitted.status !== 'ok') throw new Error(JSON.stringify(submitted))
  let verdict: any
  for (let n = 0; n < 100 && !verdict; n++) {
    const ledger = await readFile(`${vault}/.flows/ops/answers.jsonl`, 'utf8').catch(() => '')
    verdict = ledger.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).find(l => l.kind === 'verdict' && l.questionId === 'l7-e1-wait')
    if (!verdict) await new Promise(r => setTimeout(r, 300))
  }
  const after = await seam.approvalsInbox('local/ops-clone')
  const receipt = { status: verdict && row.waitRunId === verdict.execution && row.waitRunId !== row.runId ? 'PASS' : 'FAIL', controlRunId: row.runId, waitRunId: row.waitRunId, verifyExecutionId: verdict?.execution, verdict, submitted, after }
  await writeFile(`${root}/e1c.json`, JSON.stringify(receipt, null, 2))
  if (receipt.status !== 'PASS') throw new Error(JSON.stringify(receipt))
  console.log(JSON.stringify(receipt, null, 2))
} finally { await app.stop() }
