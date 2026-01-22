import type { OpenCodeExecutionOptions } from './types/opencode.js'
import type { AgentResult } from './types/execution.js'
import { spawn, type ChildProcess } from 'node:child_process'

interface OpenCodeServer {
  url: string
  close: () => void
  process: ChildProcess
}

interface OpenCodeClient {
  session: {
    create: (options?: { body?: { agent?: string } }) => Promise<{ data: { id: string } }>
    prompt: (options: {
      path: { id: string }
      body: {
        parts: Array<{ type: 'text'; text: string }>
        model?: { providerID: string; modelID: string }
        agent?: string
        system?: string
        tools?: Record<string, boolean>
      }
    }) => Promise<{
      data: {
        info: {
          id: string
          tokens: { input: number; output: number }
          finish?: string
          error?: { type: string; message?: string }
        }
        parts: Array<{ type: string; text?: string }>
      }
    }>
    abort: (options: { path: { id: string } }) => Promise<void>
  }
  event: {
    subscribe: () => AsyncIterable<{
      data: string
      event?: string
    }>
  }
  global: {
    health: () => Promise<{ data: { healthy: boolean; version: string } }>
  }
}

async function createOpencodeServer(options: {
  hostname?: string | undefined
  port?: number | undefined
  timeout?: number | undefined
  config?: Record<string, unknown> | undefined
  cwd?: string | undefined
}): Promise<OpenCodeServer> {
  const hostname = options.hostname ?? '127.0.0.1'
  const port = options.port ?? 0 // Let OS assign port
  const timeout = options.timeout ?? 10000

  const args = ['serve', `--hostname=${hostname}`, `--port=${port}`]

  const proc = spawn('opencode', args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
    },
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      proc.kill()
      reject(new Error(`OpenCode server startup timeout after ${timeout}ms`))
    }, timeout)

    let output = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const lines = output.split('\n')
      for (const line of lines) {
        if (line.includes('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) {
            clearTimeout(id)
            resolve(match[1]!)
            return
          }
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    proc.on('error', (error) => {
      clearTimeout(id)
      reject(error)
    })

    proc.on('exit', (code) => {
      clearTimeout(id)
      reject(new Error(`OpenCode server exited with code ${code}\nOutput: ${output}`))
    })
  })

  return {
    url,
    process: proc,
    close() {
      proc.kill()
    },
  }
}

function createOpencodeClient(options: { baseUrl: string; directory?: string | undefined }): OpenCodeClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.directory) {
    headers['x-opencode-directory'] = options.directory
  }

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<{ data: T }> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenCode API error ${res.status}: ${text}`)
    }
    const data = await res.json() as T
    return { data }
  }

  return {
    session: {
      async create(opts) {
        return fetchJson('/session', {
          method: 'POST',
          body: JSON.stringify(opts?.body ?? {}),
        })
      },
      async prompt(opts) {
        return fetchJson(`/session/${opts.path.id}/message`, {
          method: 'POST',
          body: JSON.stringify(opts.body),
        })
      },
      async abort(opts) {
        await fetchJson(`/session/${opts.path.id}/abort`, { method: 'POST' })
      },
    },
    event: {
      subscribe(): AsyncIterable<{ data: string; event?: string }> {
        const url = `${baseUrl}/event`
        return {
          [Symbol.asyncIterator](): AsyncIterator<{ data: string; event?: string }> {
            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
            let buffer = ''
            const decoder = new TextDecoder()
            let currentEvent: string | undefined
            let pendingYields: Array<{ data: string; event?: string }> = []
            let done = false

            const fetchAndParse = async () => {
              if (reader) return
              const res = await fetch(url, { headers })
              if (!res.ok || !res.body) {
                done = true
                return
              }
              reader = res.body.getReader()
            }

            return {
              async next(): Promise<IteratorResult<{ data: string; event?: string }>> {
                if (pendingYields.length > 0) {
                  return { value: pendingYields.shift()!, done: false }
                }
                if (done) return { value: undefined, done: true }

                await fetchAndParse()
                if (!reader || done) return { value: undefined, done: true }

                while (pendingYields.length === 0) {
                  const result = await reader.read()
                  if (result.done) {
                    done = true
                    return { value: undefined, done: true }
                  }

                  buffer += decoder.decode(result.value, { stream: true })
                  const lines = buffer.split('\n')
                  buffer = lines.pop() ?? ''

                  for (const line of lines) {
                    if (line.startsWith('event:')) {
                      currentEvent = line.slice(6).trim()
                    } else if (line.startsWith('data:')) {
                      const data = line.slice(5).trim()
                      const item: { data: string; event?: string } = { data }
                      if (currentEvent !== undefined) item.event = currentEvent
                      pendingYields.push(item)
                      currentEvent = undefined
                    }
                  }
                }

                return { value: pendingYields.shift()!, done: false }
              },
            }
          },
        }
      },
    },
    global: {
      async health() {
        return fetchJson('/global/health')
      },
    },
  }
}

function parseModel(model: string): { providerID: string; modelID: string } {
  const parts = model.split('/')
  if (parts.length >= 2) {
    return { providerID: parts[0]!, modelID: parts.slice(1).join('/') }
  }
  return { providerID: 'opencode', modelID: model }
}

export async function executeOpenCode(options: OpenCodeExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  let server: OpenCodeServer | undefined
  let sessionId: string | undefined

  try {
    server = await createOpencodeServer({
      hostname: options.hostname,
      port: options.port,
      timeout: options.serverTimeout,
      cwd: options.cwd,
    })

    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: options.cwd,
    })

    // Subscribe to events for streaming progress
    const eventPromise = (async () => {
      try {
        for await (const event of client.event.subscribe()) {
          if (event.event === 'message.part.updated') {
            const data = JSON.parse(event.data) as {
              part?: { type: string; text?: string }
              delta?: string
            }
            if (data.delta) {
              options.onProgress?.(data.delta)
            }
          } else if (event.event === 'tool.call') {
            const data = JSON.parse(event.data) as {
              tool?: string
              input?: unknown
            }
            if (data.tool) {
              options.onToolCall?.(data.tool, data.input)
            }
          }
        }
      } catch {
        // Event stream closed - normal during cleanup
      }
    })()

    // Create or resume session
    if (options.resumeSession) {
      sessionId = options.resumeSession
    } else {
      const createBody = options.agent ? { agent: options.agent } : {}
      const session = await client.session.create({ body: createBody })
      sessionId = session.data.id
    }

    // Build prompt request
    const promptBody: Parameters<typeof client.session.prompt>[0]['body'] = {
      parts: [{ type: 'text', text: options.prompt }],
    }

    if (options.model) {
      promptBody.model = parseModel(options.model)
    }
    if (options.agent) {
      promptBody.agent = options.agent
    }
    if (options.systemPrompt) {
      promptBody.system = options.systemPrompt
    }
    if (options.toolConfig) {
      promptBody.tools = options.toolConfig
    }

    // Execute prompt
    const response = await client.session.prompt({
      path: { id: sessionId },
      body: promptBody,
    })

    // Cancel event subscription
    void eventPromise

    const { info, parts } = response.data

    // Extract text from parts
    const textParts = parts.filter((p) => p.type === 'text' && p.text)
    const output = textParts.map((p) => p.text).join('\n')

    // Handle errors
    if (info.error) {
      return {
        output: info.error.message ?? info.error.type,
        tokensUsed: { input: info.tokens.input, output: info.tokens.output },
        turnsUsed: 1,
        durationMs: Date.now() - startTime,
        stopReason: 'error',
        sessionId,
      }
    }

    return {
      output,
      tokensUsed: { input: info.tokens.input, output: info.tokens.output },
      turnsUsed: 1,
      durationMs: Date.now() - startTime,
      stopReason: info.finish === 'stop' ? 'completed' : (info.finish as AgentResult['stopReason']) ?? 'completed',
      sessionId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      output: errorMessage,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      durationMs: Date.now() - startTime,
      stopReason: 'error',
    }
  } finally {
    server?.close()
  }
}
