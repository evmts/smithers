/**
 * Unit tests for SmithersChatTransport - core transport layer for chat orchestration.
 */
import { describe, test, expect } from 'bun:test'
import { SmithersChatTransport } from './smithers-chat-transport.js'
import type { SmithersMessage, SmithersChunk, ChatTransportSendOptions } from './types.js'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestMessage(overrides: Partial<SmithersMessage> = {}): SmithersMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    content: 'Test message',
    ...overrides,
  }
}

function createSendOptions(
  chatId: string,
  messages: SmithersMessage[] = [],
  overrides: Partial<ChatTransportSendOptions<SmithersMessage>> = {}
): ChatTransportSendOptions<SmithersMessage> {
  return {
    trigger: 'submit-message',
    chatId,
    messageId: messages[messages.length - 1]?.id,
    messages,
    abortSignal: undefined,
    ...overrides,
  }
}

async function collectChunks(stream: ReadableStream<SmithersChunk>, limit = 50): Promise<SmithersChunk[]> {
  const reader = stream.getReader()
  const chunks: SmithersChunk[] = []
  try {
    while (chunks.length < limit) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks
}

async function collectChunksWithTimeout(
  stream: ReadableStream<SmithersChunk>,
  timeoutMs = 1000,
  waitForComplete = false
): Promise<SmithersChunk[]> {
  const reader = stream.getReader()
  const chunks: SmithersChunk[] = []
  const timeout = Date.now() + timeoutMs

  try {
    while (Date.now() < timeout) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), 100)
        ),
      ])
      if (result.done) break
      if (result.value) {
        chunks.push(result.value)
        if (
          waitForComplete &&
          result.value.type === 'status' &&
          (result.value.status === 'completed' || result.value.status === 'failed')
        ) {
          break
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return chunks
}

// Cleanup helper - use unique paths per test to avoid conflicts
function getTestDbPath(testName: string): string {
  return path.join('.smithers', 'test-transport', `${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`)
}

// ============================================================================
// MESSAGE SERIALIZATION TESTS
// ============================================================================

describe('SmithersChatTransport - Message Serialization', () => {
  test('persists messages to state on send', async () => {
    const dbPath = getTestDbPath('persist-messages')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const messages = [
      createTestMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
      createTestMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there' }),
    ]

    const stream = await transport.sendMessages(createSendOptions('chat-1', messages))
    const chunks = await collectChunksWithTimeout(stream, 500)

    // Should receive message chunks for each message
    const messageChunks = chunks.filter((c): c is Extract<SmithersChunk, { type: 'message' }> => c.type === 'message')
    expect(messageChunks).toHaveLength(2)
    expect(messageChunks[0].message.id).toBe('msg-1')
    expect(messageChunks[1].message.id).toBe('msg-2')
  })

  test('serializes message with all fields', async () => {
    const dbPath = getTestDbPath('full-message')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const message: SmithersMessage = {
      id: 'full-msg',
      role: 'user',
      content: 'Full message test',
      createdAt: '2024-01-01T00:00:00Z',
      metadata: { source: 'test', priority: 1 },
    }

    const stream = await transport.sendMessages(createSendOptions('chat-full', [message]))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const messageChunk = chunks.find(
      (c): c is Extract<SmithersChunk, { type: 'message' }> => c.type === 'message'
    )
    expect(messageChunk).toBeDefined()
    expect(messageChunk!.message).toEqual(message)
  })

  test('handles empty message array', async () => {
    const dbPath = getTestDbPath('empty-messages')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-empty', []))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const messageChunks = chunks.filter((c) => c.type === 'message')
    expect(messageChunks).toHaveLength(0)
  })

  test('handles messages with special characters', async () => {
    const dbPath = getTestDbPath('special-chars')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const message = createTestMessage({
      content: 'Special chars: <script>alert("xss")</script> & "quotes" \'apostrophe\'',
    })

    const stream = await transport.sendMessages(createSendOptions('chat-special', [message]))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const messageChunk = chunks.find(
      (c): c is Extract<SmithersChunk, { type: 'message' }> => c.type === 'message'
    )
    expect(messageChunk!.message.content).toBe(message.content)
  })

  test('handles unicode messages', async () => {
    const dbPath = getTestDbPath('unicode')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const message = createTestMessage({
      content: '你好世界 🌍 مرحبا العالم 🚀 Привет мир',
    })

    const stream = await transport.sendMessages(createSendOptions('chat-unicode', [message]))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const messageChunk = chunks.find(
      (c): c is Extract<SmithersChunk, { type: 'message' }> => c.type === 'message'
    )
    expect(messageChunk!.message.content).toBe(message.content)
  })

  test('preserves message order', async () => {
    const dbPath = getTestDbPath('message-order')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const messages = Array.from({ length: 10 }, (_, i) =>
      createTestMessage({ id: `msg-${i}`, content: `Message ${i}` })
    )

    const stream = await transport.sendMessages(createSendOptions('chat-order', messages))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const messageChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'message' }> => c.type === 'message'
    )
    expect(messageChunks).toHaveLength(10)
    messageChunks.forEach((chunk, i) => {
      expect(chunk.message.id).toBe(`msg-${i}`)
    })
  })
})

// ============================================================================
// STREAMING BEHAVIOR TESTS
// ============================================================================

describe('SmithersChatTransport - Streaming Behavior', () => {
  test('emits status chunk on stream start', async () => {
    const dbPath = getTestDbPath('status-start')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-status', []))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const statusChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'status' }> => c.type === 'status'
    )
    expect(statusChunks.length).toBeGreaterThan(0)
    expect(statusChunks[0].chatId).toBe('chat-status')
    expect(statusChunks[0].executionId).toBeDefined()
  })

  test('emits table snapshots for default tables', async () => {
    const dbPath = getTestDbPath('table-snapshots')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-tables', []))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const tableChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'table' }> => c.type === 'table'
    )

    // Should have at least executions and state tables
    const tableNames = tableChunks.map((c) => c.table)
    expect(tableNames).toContain('executions')
    expect(tableNames).toContain('state')

    // All initial chunks should be snapshots
    const snapshotChunks = tableChunks.filter((c) => c.isSnapshot)
    expect(snapshotChunks.length).toBeGreaterThan(0)
  })

  test('supports custom table selection', async () => {
    const dbPath = getTestDbPath('custom-tables')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
      tables: ['executions', 'state'],
    })

    const stream = await transport.sendMessages(createSendOptions('chat-custom-tables', []))
    const chunks = await collectChunksWithTimeout(stream, 500)

    const tableChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'table' }> => c.type === 'table'
    )
    const tableNames = new Set(tableChunks.map((c) => c.table))

    expect(tableNames.has('executions')).toBe(true)
    expect(tableNames.has('state')).toBe(true)
    expect(tableNames.has('agents')).toBe(false)
    expect(tableNames.has('phases')).toBe(false)
  })

  test('stream can be cancelled', async () => {
    const dbPath = getTestDbPath('cancel-stream')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-cancel', []))
    const reader = stream.getReader()

    // Read one chunk then cancel
    await reader.read()
    await reader.cancel()

    // Should not throw
    expect(true).toBe(true)
  })

  test('emits completed status when orchestration finishes', async () => {
    const dbPath = getTestDbPath('completed-status')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-complete', []))
    const chunks = await collectChunks(stream)

    const statusChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'status' }> => c.type === 'status'
    )
    const finalStatus = statusChunks[statusChunks.length - 1]
    expect(finalStatus.status).toBe('completed')
  })

  test('handles multiple concurrent streams for same chat', async () => {
    const dbPath = getTestDbPath('concurrent-streams')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const chatId = 'chat-concurrent'
    const stream1 = await transport.sendMessages(createSendOptions(chatId, []))
    const stream2 = await transport.sendMessages(createSendOptions(chatId, []))

    const [chunks1, chunks2] = await Promise.all([
      collectChunksWithTimeout(stream1, 500),
      collectChunksWithTimeout(stream2, 500),
    ])

    // Both streams should receive data
    expect(chunks1.length).toBeGreaterThan(0)
    expect(chunks2.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('SmithersChatTransport - Error Handling', () => {
  test('emits failed status when orchestration throws', async () => {
    const dbPath = getTestDbPath('failed-status')
    const transport = new SmithersChatTransport({
      orchestration: () => {
        throw new Error('Test orchestration error')
      },
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-error', []))
    const chunks = await collectChunks(stream)

    const statusChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'status' }> => c.type === 'status'
    )
    const failedStatus = statusChunks.find((c) => c.status === 'failed')
    expect(failedStatus).toBeDefined()
    expect(failedStatus!.error).toBe('Test orchestration error')
  })

  test('handles async orchestration rejection', async () => {
    const dbPath = getTestDbPath('async-error')
    const transport = new SmithersChatTransport({
      orchestration: async () => {
        await new Promise<void>((resolve) => queueMicrotask(resolve))
        throw new Error('Async error')
      },
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-async-error', []))
    const chunks = await collectChunks(stream)

    const failedStatus = chunks.find(
      (c): c is Extract<SmithersChunk, { type: 'status' }> =>
        c.type === 'status' && c.status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect(failedStatus!.error).toBe('Async error')
  })

  test('handles abort signal', async () => {
    const dbPath = getTestDbPath('abort-signal')
    const controller = new AbortController()
    let resolveOrchestration: (() => void) | null = null
    const orchestrationBlock = new Promise<void>((resolve) => {
      resolveOrchestration = resolve
    })
    const transport = new SmithersChatTransport({
      orchestration: async () => {
        await orchestrationBlock
        return null
      },
      dbPath,
    })

    const stream = await transport.sendMessages(
      createSendOptions('chat-abort', [], { abortSignal: controller.signal })
    )

    // Abort immediately
    controller.abort()

    const chunks = await collectChunksWithTimeout(stream, 500)
    resolveOrchestration?.()

    // Should have some chunks (status started + tables)
    expect(chunks.length).toBeGreaterThan(0)
  })

  test('handles pre-aborted signal', async () => {
    const dbPath = getTestDbPath('pre-abort')
    const controller = new AbortController()
    controller.abort()

    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(
      createSendOptions('chat-pre-abort', [], { abortSignal: controller.signal })
    )

    const chunks = await collectChunks(stream)
    expect(chunks.length).toBeGreaterThan(0)
  })

  test('throws for multiple chatIds with non-template dbPath', async () => {
    const dbPath = getTestDbPath('single-path')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    // First chat should work
    await transport.sendMessages(createSendOptions('chat-1', []))

    // Second chat with different ID should throw
    await expect(transport.sendMessages(createSendOptions('chat-2', []))).rejects.toThrow(
      /does not support multiple chatIds/
    )
  })

  test('supports multiple chatIds with template dbPath', async () => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const basePath = path.join('.smithers', 'test-transport', `multi-${uniqueId}-{chatId}.sqlite`)
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath: basePath,
    })

    // Create both sessions sequentially to ensure isolation
    const stream1 = await transport.sendMessages(createSendOptions(`chat-a-${uniqueId}`, []))
    const chunks1 = await collectChunks(stream1)
    
    const stream2 = await transport.sendMessages(createSendOptions(`chat-b-${uniqueId}`, []))
    const chunks2 = await collectChunks(stream2)

    expect(chunks1.length).toBeGreaterThan(0)
    expect(chunks2.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// RECONNECTION TESTS
// ============================================================================

describe('SmithersChatTransport - Reconnection', () => {
  test('reconnectToStream returns null for unknown chat', async () => {
    const dbPath = getTestDbPath('reconnect-unknown')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
    })

    const result = await transport.reconnectToStream({ chatId: 'unknown-chat' })
    expect(result).toBeNull()
  })

  test('reconnectToStream returns stream for active session', async () => {
    const dbPath = getTestDbPath('reconnect-active')
    let resolveOrchestration: () => void
    const orchestrationPromise = new Promise<void>((resolve) => {
      resolveOrchestration = resolve
    })

    const transport = new SmithersChatTransport({
      orchestration: async () => {
        await orchestrationPromise
        return null
      },
      dbPath,
    })

    const chatId = 'chat-reconnect'
    const mainStream = await transport.sendMessages(createSendOptions(chatId, []))

    // Reconnect while still running
    const reconnectStream = await transport.reconnectToStream({ chatId })
    expect(reconnectStream).not.toBeNull()

    // Release orchestration
    resolveOrchestration!()

    const [mainChunks, reconnectChunks] = await Promise.all([
      collectChunks(mainStream),
      collectChunks(reconnectStream!),
    ])

    expect(mainChunks.length).toBeGreaterThan(0)
    expect(reconnectChunks.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// DB PATH RESOLUTION TESTS
// ============================================================================

describe('SmithersChatTransport - DB Path Resolution', () => {
  test('uses default path when dbPath not provided', async () => {
    const transport = new SmithersChatTransport({
      orchestration: () => null,
    })

    const chatId = `test-default-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const expectedPath = path.join('.smithers', 'chat-transport', `${chatId}.sqlite`)

    const stream = await transport.sendMessages(createSendOptions(chatId, []))
    await collectChunks(stream)

    expect(fs.existsSync(expectedPath)).toBe(true)
  })

  test('supports directory-style dbPath', async () => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const basePath = path.join('.smithers', 'test-transport', `dir-style-${uniqueId}/`)
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath: basePath,
    })

    const chatId = `test-dir-${uniqueId}`
    const expectedPath = path.join(basePath, `${chatId}.sqlite`)

    const stream = await transport.sendMessages(createSendOptions(chatId, []))
    await collectChunks(stream)

    expect(fs.existsSync(expectedPath)).toBe(true)
  })
})

// ============================================================================
// ORCHESTRATION CONTEXT TESTS
// ============================================================================

describe('SmithersChatTransport - Orchestration Context', () => {
  test('passes correct context to orchestration function', async () => {
    const dbPath = getTestDbPath('context')
    let receivedContext: unknown

    const transport = new SmithersChatTransport({
      orchestration: (ctx) => {
        receivedContext = ctx
        return null
      },
      dbPath,
    })

    const messages = [createTestMessage({ id: 'ctx-msg', content: 'Context test' })]
    const stream = await transport.sendMessages(createSendOptions('chat-context', messages))
    await collectChunks(stream)

    const ctx = receivedContext as {
      chatId: string
      executionId: string
      db: unknown
      messages: SmithersMessage[]
      trigger: string
    }

    expect(ctx.chatId).toBe('chat-context')
    expect(ctx.executionId).toBeDefined()
    expect(ctx.db).toBeDefined()
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.messages[0].id).toBe('ctx-msg')
    expect(ctx.trigger).toBe('submit-message')
  })

  test('supports ReactNode orchestration', async () => {
    const dbPath = getTestDbPath('react-node')

    const transport = new SmithersChatTransport({
      orchestration: null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-react', []))
    const chunks = await collectChunksWithTimeout(stream, 3000, true)

    // Null orchestration should complete successfully
    const statusChunks = chunks.filter(
      (c): c is Extract<SmithersChunk, { type: 'status' }> => c.type === 'status'
    )
    expect(statusChunks.length).toBeGreaterThan(0)
  })

  test('supports async orchestration factory', async () => {
    const dbPath = getTestDbPath('async-factory')
    const transport = new SmithersChatTransport({
      orchestration: async () => null,
      dbPath,
    })

    const stream = await transport.sendMessages(createSendOptions('chat-async-factory', []))
    const chunks = await collectChunksWithTimeout(stream, 3000, true)

    const hasStatus = chunks.some((c) => c.type === 'status')
    expect(hasStatus).toBe(true)
  })
})

// ============================================================================
// CONFIG TESTS
// ============================================================================

describe('SmithersChatTransport - Configuration', () => {
  test('passes config to SmithersProvider', async () => {
    const dbPath = getTestDbPath('config')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
      config: {
        logLevel: 'debug',
      },
    })

    const stream = await transport.sendMessages(createSendOptions('chat-config', []))
    const chunks = await collectChunksWithTimeout(stream, 3000, true)

    expect(chunks.length).toBeGreaterThan(0)
  })

  test('uses custom execution name', async () => {
    const dbPath = getTestDbPath('exec-name')
    const transport = new SmithersChatTransport({
      orchestration: () => null,
      dbPath,
      executionName: 'custom-execution',
    })

    const stream = await transport.sendMessages(createSendOptions('chat-exec-name', []))
    const chunks = await collectChunksWithTimeout(stream, 3000, true)

    const tableChunk = chunks.find(
      (c): c is Extract<SmithersChunk, { type: 'table' }> =>
        c.type === 'table' && c.table === 'executions'
    )
    expect(tableChunk).toBeDefined()
    expect(tableChunk!.rows.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// TRIGGER TYPE TESTS
// ============================================================================

describe('SmithersChatTransport - Trigger Types', () => {
  test('handles submit-message trigger', async () => {
    const dbPath = getTestDbPath('trigger-submit')
    let receivedTrigger: string | undefined

    const transport = new SmithersChatTransport({
      orchestration: (ctx) => {
        receivedTrigger = ctx.trigger
        return null
      },
      dbPath,
    })

    const stream = await transport.sendMessages(
      createSendOptions('chat-submit', [], { trigger: 'submit-message' })
    )
    await collectChunksWithTimeout(stream, 3000, true)

    expect(receivedTrigger).toBe('submit-message')
  })

  test('handles regenerate-message trigger', async () => {
    const dbPath = getTestDbPath('trigger-regen')
    let receivedTrigger: string | undefined

    const transport = new SmithersChatTransport({
      orchestration: (ctx) => {
        receivedTrigger = ctx.trigger
        return null
      },
      dbPath,
    })

    const stream = await transport.sendMessages(
      createSendOptions('chat-regen', [], { trigger: 'regenerate-message' })
    )
    await collectChunksWithTimeout(stream, 3000, true)

    expect(receivedTrigger).toBe('regenerate-message')
  })
})
