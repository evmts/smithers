import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { OutputParser } from '../monitor/output-parser.jsx'
import { StreamFormatter } from '../monitor/stream-formatter.jsx'
import { LogWriter } from '../monitor/log-writer.jsx'
import { summarizeWithHaiku } from '../monitor/haiku-summarizer.jsx'

/**
 * Find the preload.ts file from the smithers-orchestrator package
 */
function findPreloadPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // Navigate up from src/commands to package root
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    const preloadPath = path.join(dir, 'preload.ts')
    if (fs.existsSync(preloadPath)) {
      return preloadPath
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find preload.ts - smithers-orchestrator may be incorrectly installed')
}

interface MonitorOptions {
  file?: string
  summary?: boolean
}

export async function monitor(fileArg?: string, options: MonitorOptions = {}) {
  const file = fileArg || options.file || '.smithers/main.tsx'
  const filePath = path.resolve(file)
  const enableSummary = options.summary !== false

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  // Check if file is executable
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    fs.chmodSync(filePath, '755')
  }

  // Initialize monitoring components
  const parser = new OutputParser()
  const formatter = new StreamFormatter()
  const logWriter = new LogWriter()

  // Print header
  console.log(formatter.formatHeader(filePath))

  // Start execution
  const startTime = Date.now()
  const preloadPath = findPreloadPath()
  const child = spawn('bun', ['--preload', preloadPath, '--install=fallback', filePath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })

  // Handle stdout
  child.stdout?.on('data', async (data) => {
    const chunk = data.toString()

    // Parse events from output
    const events = parser.parseChunk(chunk)

    // Process each event
    for (const event of events) {
      let logPath: string | undefined
      let summary: string | undefined

      // For tool calls and errors, save to logs and optionally summarize
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

    // Also print raw output for transparency
    // Comment this out if you want only structured output
    // process.stdout.write(chunk)
  })

  // Handle stderr
  child.stderr?.on('data', async (data) => {
    const chunk = data.toString()
    const logPath = logWriter.writeError(chunk)

    // Try to summarize errors if they're large
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

  // Handle process errors
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

  // Handle process exit
  child.on('exit', (code) => {
    // Flush any remaining events
    const remainingEvents = parser.flush()
    for (const event of remainingEvents) {
      const formatted = formatter.formatEvent(event)
      if (formatted) {
        process.stdout.write(formatted)
      }
    }

    const duration = Date.now() - startTime

    // Print summary
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
