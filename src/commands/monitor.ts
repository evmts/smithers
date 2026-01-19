import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { OutputParser } from '../monitor/output-parser.jsx'
import { StreamFormatter } from '../monitor/stream-formatter.jsx'
import { LogWriter } from '../monitor/log-writer.jsx'
import { summarizeWithHaiku } from '../monitor/haiku-summarizer.jsx'
import { ensureExecutable, findPreloadPath, resolveEntrypoint } from './cli-utils.js'

interface MonitorOptions {
  file?: string
  summary?: boolean
}

export async function monitor(fileArg?: string, options: MonitorOptions = {}) {
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
    shell: true,
  })

  child.stdout?.on('data', async (data) => {
    const chunk = data.toString()

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
  })

  child.stderr?.on('data', async (data) => {
    const chunk = data.toString()
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
  })

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

    process.exit(1)
  })

  child.on('exit', (code) => {
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

    process.exit(code || 0)
  })
}
