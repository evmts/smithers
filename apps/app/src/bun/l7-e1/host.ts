// Disposable E1 host. Never ship or land.
import { readFile, writeFile } from 'node:fs/promises'
import { startLocalServer } from '../server'
const root = '/tmp/ops-l7-e1-evidence'
const token = (await readFile(`${root}/serve.stderr`, 'utf8')).match(/approval token  (\S+)/)?.[1]
if (!token) throw new Error('serve not ready')
const health = await (await fetch('http://127.0.0.1:17491/health')).json() as any
await writeFile(`${root}/health.json`, JSON.stringify(health, null, 2))
const app = await startLocalServer({ port: 61264, distDir: `${root}/dist`, stateDir: `${root}/app-state`, cloudMode: 'offline', publicHostname: 'localhost',
  localGateway: { url: 'http://127.0.0.1:17491', repo: 'local/spike', workspaceId: health.workspaceHash, operatorToken: token } })
await writeFile(`${root}/host.json`, JSON.stringify({ origin: app.origin }))
process.on('SIGTERM', async () => { await app.stop(); process.exit(0) })
process.on('SIGINT', async () => { await app.stop(); process.exit(0) })
