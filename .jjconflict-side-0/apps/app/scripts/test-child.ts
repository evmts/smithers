import { spawnSync as nativeSpawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const supervisor = fileURLToPath(new URL('./test-child-supervisor.mjs', import.meta.url))

/*
 * Bun's synchronous spawn can miss the exit of a child that already finished:
 * on GitHub's runners, late in the unit suite, supervisors answered in 250 ms
 * and Bun waited the full 40 seconds (#3763, run 38493923562). Under Bun the
 * supervisor is started without waiting on its exit, and the caller polls for
 * the answer file it publishes by rename.
 */
const supervise = (request: Record<string, unknown>, deadline: number): { stdout?: string; error?: Error } => {
  if (typeof Bun === 'undefined') {
    const result = nativeSpawnSync(process.execPath, [supervisor], {
      input: JSON.stringify(request), encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], timeout: deadline, killSignal: 'SIGKILL',
      maxBuffer: ((request.options as any).maxBuffer ?? 16 * 1024 * 1024) * 2 + 4096
    })
    return result.error ? { error: result.error } : { stdout: result.stdout }
  }
  const dir = mkdtempSync(join(tmpdir(), 'test-child-'))
  const answer = join(dir, 'answer.json'), file = join(dir, 'request.json')
  try {
    writeFileSync(file, JSON.stringify({ ...request, answer }))
    const process = Bun.spawn([Bun.which('node')!, supervisor, file], { stdin: 'ignore', stdout: 'ignore', stderr: 'inherit' })
    const end = Date.now() + deadline
    while (!existsSync(answer) && Date.now() < end) Bun.sleepSync(5)
    if (!existsSync(answer)) {
      process.kill('SIGKILL')
      return { error: Object.assign(new Error(`spawnSync ${Bun.which('node')} ETIMEDOUT`), { code: 'ETIMEDOUT' }) }
    }
    return { stdout: readFileSync(answer, 'utf8') }
  } finally { rmSync(dir, { recursive: true, force: true }) }
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
  const result = supervise(request, timeout + 10_000)
  const steps = () => {
    try { return readFileSync(trail, 'utf8').trim().split('\n').join(',') } catch { return 'none' } finally { rmSync(trail, { force: true }) }
  }
  if (result.error) throw Object.assign(result.error, { message: `${result.error.message}; supervisor=${steps()}${machine()}` })
  steps()
  const child = JSON.parse(result.stdout!)
  for (const key of ['stdout', 'stderr']) {
    const buffer = Buffer.from(child[key], 'base64')
    child[key] = options.encoding && options.encoding !== 'buffer' ? buffer.toString(options.encoding) : buffer
  }
  child.output = [null, child.stdout, child.stderr]
  if (child.error) child.error = Object.assign(new Error(child.error.message), child.error)
  return child
}) as typeof nativeSpawnSync

/** Bun.spawnSync's argv form and result fields, through the same supervisor. */
export const runSync = (argv: ReadonlyArray<string>, options: { cwd?: string; env?: Record<string, string | undefined>; timeout?: number } = {}) => {
  const result = spawnSync(argv[0]!, argv.slice(1), { ...(options.cwd === undefined ? {} : { cwd: options.cwd }), ...(options.env === undefined ? {} : { env: options.env }), ...(options.timeout === undefined ? {} : { timeout: options.timeout }) })
  if (result.error) throw result.error
  return { exitCode: result.status ?? -1, stdout: result.stdout as Buffer, stderr: result.stderr as Buffer }
}
