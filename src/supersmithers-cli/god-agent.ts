import { buildGodAgentPrompt } from './prompts.js'

export interface GodAgentOptions {
  planFile: string
  dbPath: string
  maxRestarts: number
  restartCooldown: number
  model: 'haiku' | 'sonnet' | 'opus'
  reportBugs: boolean
  dryRun: boolean
}

const modelMap: Record<string, string> = {
  opus: 'claude-opus-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
}

let claudeProcess: ReturnType<typeof Bun.spawn> | null = null

function setupSignalHandlers() {
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (claudeProcess) {
      claudeProcess.kill(signal === 'SIGINT' ? 'SIGTERM' : signal)
    }
  }
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
}

export async function runGodAgent(options: GodAgentOptions): Promise<number> {
  setupSignalHandlers()

  const systemPrompt = buildGodAgentPrompt({
    planFile: options.planFile,
    dbPath: options.dbPath,
    maxRestarts: options.maxRestarts,
    restartCooldown: options.restartCooldown,
  })

  const promptFile = `/tmp/supersmithers-prompt-${Date.now()}.md`
  await Bun.write(promptFile, systemPrompt)

  const modelId = modelMap[options.model] || options.model
  const args = [
    '--print',
    '--system-prompt', promptFile,
    '--model', modelId,
    '--allowedTools', 'Bash',
    '--allowedTools', 'Read',
    '--allowedTools', 'Write',
    '--dangerously-skip-permissions',
  ]

  if (!options.reportBugs) {
    args.push('--disallowedTools', 'mcp__gh')
  }

  const initialMessage = `Start monitoring ${options.planFile}`

  console.log('[SUPER] Starting god agent...')
  console.log(`[SUPER] Model: ${modelId}`)
  console.log(`[SUPER] Prompt file: ${promptFile}`)
  console.log('')

  const proc = Bun.spawn(['claude', ...args], {
    stdin: new Blob([initialMessage]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })
  claudeProcess = proc

  const decoder = new TextDecoder()

  const readStream = async (stream: ReadableStream<Uint8Array>, prefix: string) => {
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${prefix} ${line}`)
        }
      }
    }
  }

  await Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, '[SUPER]'),
    readStream(proc.stderr as ReadableStream<Uint8Array>, '[SUPER:ERR]'),
  ])

  const exitCode = await proc.exited

  try {
    if (await Bun.file(promptFile).exists()) {
      await Bun.$`rm ${promptFile}`.quiet()
    }
  } catch {}

  console.log('')
  console.log(`[SUPER] God agent exited with code ${exitCode}`)

  return exitCode
}
