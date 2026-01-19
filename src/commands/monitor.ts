import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { OutputParser, StreamFormatter, LogWriter, summarizeWithHaiku } from '../monitor/index.js'
import { ensureExecutable, findPreloadPath, resolveEntrypoint } from './cli-utils.js'

interface MonitorOptions {
  file?: string
  summary?: boolean
  /** If true, don't call process.exit() when child exits. Used for testing. */
  noExit?: boolean
}

export interface MonitorResult {
  child: ChildProcess
  promise: Promise<number>
}

export async function monitor(fileArg?: string, options: MonitorOptions = {}): Promise<MonitorResult> {
  const filePath = resolveEntrypoint(fileArg, options.file)
  const enableSummary = options.summary !== false

  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  ensureExecutable(filePath)

  const parser = new OutputParser()
  const formatter = new StreamFormatter()
  const logWriter = new LogWriter()

  console.log(formatter.formatHeader(filePath))

  const startTime = Date.now()
  const preloadPath = findPreloadPath(import.meta.url)
  const child = spawn('bun', ['--preload', preloadPath, '--install=fallback', filePath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  })

  const handleStdoutChunk = async (chunk: string) => {
    const events = parser.parseChunk(chunk)

    for (const event of events) {
      let logPath: string | undefined
      let summary: string | undefined

      if (event.type === 'tool' && event.raw) {
        logPath = logWriter.writeToolCall(event.data['name'], {}, event.raw)

        if (enableSummary) {
          const summaryResult = await summarizeWithHaiku(
            event.raw,
            'output',
            logPath
          )
          summary = summaryResult.summary
        }
      } else if (event.type === 'error') {
        logPath = logWriter.writeError(event.data['message'])
      } else if (event.type === 'agent' && event.data['status'] === 'COMPLETE') {
        logPath = logWriter.writeAgentResult(event.data['name'], event.raw)

        if (enableSummary && event.raw.length > 200) {
          const summaryResult = await summarizeWithHaiku(
            event.raw,
            'result',
            logPath
          )
          summary = summaryResult.summary
        }
      }

      // Format and print event
      const formatted = formatter.formatEvent(event, logPath, summary)
      if (formatted) {
        process.stdout.write(formatted)
      }
    }
  }

  let stdoutChain = Promise.resolve()
  let stderrChain = Promise.resolve()
  child.stdout?.on('data', (data) => {
    const chunk = data.toString()
    stdoutChain = stdoutChain
      .then(() => handleStdoutChunk(chunk))
      .catch((err) => {
        console.warn('[monitor] stdout processing error:', err instanceof Error ? err.message : String(err))
      })
  })

  const handleStderrChunk = async (chunk: string) => {
    const logPath = logWriter.writeError(chunk)

    let summary: string | undefined
    if (enableSummary && chunk.split('\n').length > 10) {
      const summaryResult = await summarizeWithHaiku(
        chunk,
        'error',
        logPath
      )
      summary = summaryResult.summary
    }

    process.stderr.write(`[${new Date().toTimeString().substring(0, 8)}] ✗ ERROR:\n`)
    if (summary) {
      process.stderr.write(`           ${summary}\n`)
    } else {
      process.stderr.write(`           ${chunk}`)
    }
    process.stderr.write(`           📄 Full error: ${logPath}\n\n`)
  }

  child.stderr?.on('data', (data) => {
    const chunk = data.toString()
    stderrChain = stderrChain
      .then(() => handleStderrChunk(chunk))
      .catch((err) => {
        console.warn('[monitor] stderr processing error:', err instanceof Error ? err.message : String(err))
      })
  })

  const promise = new Promise<number>((resolve, reject) => {
    child.on('error', (error) => {
      console.error('')
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.error('')
      console.error('❌ Execution failed:', error.message)
      console.error('')

      if (error.message.includes('ENOENT')) {
        console.error('Bun not found. Install it:')
        console.error('   curl -fsSL https://bun.sh/install | bash')
        console.error('')
      }

      const logPath = logWriter.writeError(error)
      console.error(`📄 Error log: ${logPath}`)
      console.error('')

      reject(error)
      if (!options.noExit) {
        process.exit(1)
      }
    })

    child.on('exit', (code) => {
      const finalize = async () => {
        await Promise.allSettled([stdoutChain, stderrChain])
        const remainingEvents = parser.flush()
        for (const event of remainingEvents) {
          const formatted = formatter.formatEvent(event)
          if (formatted) {
            process.stdout.write(formatted)
          }
        }

        const duration = Date.now() - startTime

        console.log(formatter.formatSummary(duration, logWriter.getLogDir()))

        if (code === 0) {
          console.log('✅ Orchestration completed successfully')
          console.log('')
        } else {
          console.log(`❌ Orchestration exited with code: ${code}`)
          console.log('')
        }

        resolve(code || 0)
        if (!options.noExit) {
          process.exit(code || 0)
        }
      }

      void finalize()
    })
  })

  return { child, promise }
}
