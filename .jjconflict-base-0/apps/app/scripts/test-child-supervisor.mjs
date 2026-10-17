// Run with Node, outside Bun's synchronous child-process implementation.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync, readdirSync, readlinkSync, renameSync, writeFileSync } from 'node:fs'
// Under Bun the request is a file and the answer is written beside it (test-child.ts).
const request = JSON.parse(readFileSync(process.argv[2] ?? 0, 'utf8'))
const { command, args, options } = request
// Each step and its milliseconds since the caller started, for test-child's error.
const mark = step => { if (request.trail) try { appendFileSync(request.trail, `${step}@${Date.now() - request.startedAt}\n`) } catch {} }
mark('started')
let child, timer, finished = false
const stdout = [], stderr = []
let bytes = 0
const finish = (status, signal, error) => {
  if (finished) return
  finished = true
  clearTimeout(timer)
  const answer = JSON.stringify({ pid: child?.pid, supervisorPid: process.pid, status, signal, error,
    stdout: Buffer.concat(stdout).toString('base64'), stderr: Buffer.concat(stderr).toString('base64') })
  if (request.answer) {
    // Rename publishes the whole answer at once: the caller polls for the file.
    writeFileSync(`${request.answer}.partial`, answer)
    renameSync(`${request.answer}.partial`, request.answer)
    mark('answered')
    process.stderr.write('', () => process.exit(0))
  } else process.stderr.write('', () => process.stdout.write(answer, () => { mark('answered'); process.exit(0) }))
}
const kill = () => {
  if (!child?.pid) return
  try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
}
// A timeout may not record another task's work. The global process listing this
// printed carried other sessions' full command lines, and even our own target's
// argv can hold inline code, a prompt or a credential, so diagnostics name the
// supervised group alone and only as bounded facts: pid, parent, group, wait
// state, descriptors, stack and counts. Never a command line, never a signal to
// a process outside the group (#3763).
const safeState = value => (/^[A-Za-z][A-Za-z+<>?]{0,5}$/.test(value ?? '') ? value : 'unknown')
const exeName = value => {
  const base = String(value ?? '').split('/').pop()
  return /^[\w.+-]{1,64}$/.test(base) ? base : 'unnamed'
}
const sum = chunks => chunks.reduce((total, chunk) => total + chunk.length, 0)
// The group id is the child's own pid: detached spawn made the group for it.
// Another process's group id is read only to decide membership, and no field of
// a process outside the group is ever printed.
const groupMembers = () => {
  if (process.platform === 'linux') {
    // /proc has no group filter, so each stat is read and all but ours dropped.
    return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(pid => {
      try {
        // State, parent and group are the fields after comm, which the split drops with it.
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')
        return Number(stat[2]) === child.pid ? [{ pid, ppid: stat[1], state: safeState(stat[0]) }] : []
      } catch { return [] /* Process exited during inspection. */ }
    })
  }
  // -g selects by process group leader, so ps lists no other group, and the
  // COMMAND column is not asked for at all.
  const ps = spawnSync('/bin/ps', ['-o', 'pid=,ppid=,pgid=,state=', '-g', String(child.pid)],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 1000 })
  return (ps.stdout ?? '').split('\n').flatMap(line => {
    const [pid, ppid, pgid, state] = line.trim().split(/\s+/)
    return /^\d+$/.test(pid ?? '') && pgid === String(child.pid) ? [{ pid, ppid, state: safeState(state) }] : []
  })
}
const diagnostics = () => {
  const members = groupMembers()
  process.stderr.write(`[test-child timeout] PID ${child.pid} pgid=${child.pid} exe=${exeName(command)} argc=${args?.length ?? 0}` +
    ` timeout=${options.timeout}ms elapsed=${Number.isFinite(request.startedAt) ? `${Date.now() - request.startedAt}ms` : 'unknown'}` +
    ` stdin=${options.input === undefined ? 'devnull' : 'written'} stdoutBytes=${sum(stdout)} stderrBytes=${sum(stderr)}` +
    ` group=${members.length}\n`)
  for (const member of members) process.stderr.write(`[pid ${member.pid}] ppid=${member.ppid} state=${member.state}\n`)
  if (process.platform === 'linux') {
    // Include descendants: the leader may have exited while a grandchild holds stdout open.
    for (const { pid } of members) {
      try {
        const fds = readdirSync(`/proc/${pid}/fd`).map(fd => {
          try { return `${fd} -> ${readlinkSync(`/proc/${pid}/fd/${fd}`)}` } catch { return `${fd} -> unavailable` }
        })
        process.stderr.write(`[pid ${pid}] descriptors:\n${fds.join('\n')}\n`)
        for (const file of ['stack', 'wchan', 'status']) {
          try { process.stderr.write(`${file}: ${readFileSync(`/proc/${pid}/${file}`, 'utf8')}\n`) }
          catch (error) { process.stderr.write(`${file}: ${error.code}\n`) }
        }
      } catch { /* Process exited during inspection. */ }
    }
  } else {
    // Same reason as the Linux descendant walk, bounded because each call costs
    // seconds: the leader first, then one surviving descendant.
    for (const { pid } of members.slice(0, 2)) {
      for (const [cmd, argv] of [['/usr/sbin/lsof', ['-p', pid]], ['/usr/bin/sample', [pid, '1', '1']]]) {
        const result = spawnSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 2000 })
        process.stderr.write(`${cmd}: pid ${pid}\n${result.stdout ?? ''}${result.stderr ?? ''}\n`)
      }
    }
  }
}
try {
  child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: true,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
  if (options.input !== undefined) {
    child.stdin.on('error', () => {}) // The child can close stdin before consuming all input.
    child.stdin.end(Buffer.from(options.input, 'base64'))
  }
  for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', chunk => {
    bytes += chunk.length
    if (bytes > (options.maxBuffer ?? 16 * 1024 * 1024)) { kill(); finish(null, 'SIGKILL', { code: 'ENOBUFS', message: 'child output exceeded maxBuffer' }) }
    else chunks.push(chunk)
  })
  child.on('error', error => finish(null, null, { code: error.code, message: error.message }))
  mark('spawned')
  child.on('close', (status, signal) => { mark(`closed:${status ?? signal}`); kill(); finish(status, signal) })
  timer = setTimeout(() => {
    mark('timeout')
    diagnostics()
    kill()
    finish(null, 'SIGKILL', { code: 'ETIMEDOUT', message: `child exceeded ${options.timeout}ms` })
  }, options.timeout)
} catch (error) { kill(); finish(null, null, { code: error.code, message: error.message }) }
