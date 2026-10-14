import { spawnSync as nativeSpawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// #3763: on GitHub's runners a supervisor sometimes never answers. Its error
// then says what the machine was short of, so the test report can tell memory
// or CPU starvation from an exit this process missed.
const machine = (): string => {
  if (process.platform !== 'linux') return ''
  const read = (path: string) => { try { return readFileSync(path, 'utf8') } catch { return '' } }
  const meminfo = read('/proc/meminfo')
  const kB = (name: string) => meminfo.match(new RegExp(`^${name}:\\s+(\\d+) kB`, 'm'))?.[1] ?? '?'
  const some = (kind: string) => read(`/proc/pressure/${kind}`).match(/some avg10=([\d.]+)/)?.[1] ?? '?'
  return `; rss=${Math.round(process.memoryUsage().rss / 2 ** 20)}MiB available=${kB('MemAvailable')}kB swapFree=${kB('SwapFree')}kB` +
    ` pressure cpu=${some('cpu')} memory=${some('memory')} io=${some('io')} load=${read('/proc/loadavg').trim()}`
}

// Node supervises the process group while Bun's calling test is blocked. Only
// descriptors 0/1/2 are passed; stdin is /dev/null unless explicit input exists.
export const spawnSync: typeof nativeSpawnSync = ((command: string, args: string[] = [], options: any = {}) => {
  const timeout = options.timeout || 30_000
  // The supervisor appends each step it reaches to this file, so a stall says
  // whether it never started, waited on its child, or answered unheard (#3763).
  const trail = join(tmpdir(), `test-child-${process.pid}-${randomUUID()}`)
  const request = { command, args, trail, startedAt: Date.now(), options: { ...options, timeout,
    cwd: options.cwd instanceof URL ? fileURLToPath(options.cwd) : options.cwd,
    input: options.input === undefined ? undefined : Buffer.from(options.input).toString('base64') } }
  const result = nativeSpawnSync(typeof Bun === 'undefined' ? process.execPath : Bun.which('node')!, [fileURLToPath(new URL('./test-child-supervisor.mjs', import.meta.url))], {
    input: JSON.stringify(request), encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
    timeout: timeout + 10_000, killSignal: 'SIGKILL', maxBuffer: (options.maxBuffer ?? 16 * 1024 * 1024) * 2 + 4096
  })
  const steps = () => {
    try { return readFileSync(trail, 'utf8').trim().split('\n').join(',') } catch { return 'none' } finally { rmSync(trail, { force: true }) }
  }
  if (result.error) throw Object.assign(result.error, { message: `${result.error.message}; supervisor=${steps()}${machine()}` })
  steps()
  const child = JSON.parse(result.stdout)
  for (const key of ['stdout', 'stderr']) {
    const buffer = Buffer.from(child[key], 'base64')
    child[key] = options.encoding && options.encoding !== 'buffer' ? buffer.toString(options.encoding) : buffer
  }
  child.output = [null, child.stdout, child.stderr]
  if (child.error) child.error = Object.assign(new Error(child.error.message), child.error)
  return child
}) as typeof nativeSpawnSync
