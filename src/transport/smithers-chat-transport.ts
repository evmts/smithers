import path from 'path'
import * as fs from 'fs'
import { pathToFileURL } from 'url'
import React, { createElement, cloneElement, isValidElement, type ReactNode } from 'react'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider, createOrchestrationPromise, type SmithersConfig } from '../components/SmithersProvider.js'
import type {
  ChatTransport,
  ChatTransportSendOptions,
  ChatTransportReconnectOptions,
  SmithersChunk,
  SmithersMessage,
  SmithersTable,
} from './types.js'

// ============================================================================
// TYPES
// ============================================================================

export interface SmithersOrchestrationContext {
  chatId: string
  executionId: string
  db: SmithersDB
  messages: SmithersMessage[]
  trigger: ChatTransportSendOptions<SmithersMessage>['trigger']
}

export type SmithersOrchestration =
  | ReactNode
  | ((context: SmithersOrchestrationContext) => ReactNode | Promise<ReactNode>)

export interface SmithersChatTransportOptions {
  /**
   * Orchestration component, factory, or module path.
   */
  orchestration: SmithersOrchestration | string

  /**
   * Database path. Use '{chatId}' to create per-chat databases.
   */
  dbPath?: string

  /**
   * Smithers configuration passed to SmithersProvider and execution config.
   */
  config?: SmithersConfig

  /**
   * Execution name override.
   */
  executionName?: string

  /**
   * Execution file path override when orchestration is not a path.
   */
  executionFilePath?: string

  /**
   * Tables to stream (defaults to all Smithers tables).
   */
  tables?: SmithersTable[]
}

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped'

interface ChatSession {
  chatId: string
  dbPath: string
  db: SmithersDB
  executionId: string
  root: SmithersRoot | null
  status: SessionStatus
  error?: string
  startPromise?: Promise<void>
  controllers: Set<ReadableStreamDefaultController<SmithersChunk>>
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TABLES: SmithersTable[] = [
  'executions',
  'phases',
  'steps',
  'tasks',
  'agents',
  'tool_calls',
  'reports',
  'artifacts',
  'commits',
  'snapshots',
  'reviews',
  'human_interactions',
  'state',
  'transitions',
  'render_frames',
]

const TABLE_ORDER: Record<SmithersTable, string | null> = {
  executions: 'created_at ASC',
  phases: 'created_at ASC',
  agents: 'created_at ASC',
  tool_calls: 'created_at ASC',
  state: 'updated_at ASC',
  transitions: 'created_at ASC',
  artifacts: 'created_at ASC',
  reports: 'created_at ASC',
  commits: 'created_at ASC',
  snapshots: 'created_at ASC',
  reviews: 'created_at ASC',
  tasks: 'started_at ASC',
  steps: 'created_at ASC',
  human_interactions: 'created_at ASC',
  render_frames: 'sequence_number ASC',
}

// ============================================================================
// HELPERS
// ============================================================================

function isMemoryDbPath(dbPath: string): boolean {
  return dbPath === ':memory:'
}

function resolveDbPath(basePath: string | undefined, chatId: string): { path: string; isTemplate: boolean } {
  if (!basePath) {
    return { path: path.join('.smithers', 'chat-transport', `${chatId}.sqlite`), isTemplate: true }
  }

  if (basePath.includes('{chatId}')) {
    return { path: basePath.split('{chatId}').join(chatId), isTemplate: true }
  }

  if (basePath.endsWith('/') || basePath.endsWith(path.sep)) {
    return { path: path.join(basePath, `${chatId}.sqlite`), isTemplate: true }
  }

  return { path: basePath, isTemplate: false }
}

function ensureDbDirectory(dbPath: string): void {
  if (isMemoryDbPath(dbPath)) return
  const dir = path.dirname(dbPath)
  if (!dir || dir === '.') return
  fs.mkdirSync(dir, { recursive: true })
}

async function resolveOrchestration(
  orchestration: SmithersOrchestration | string,
  context: SmithersOrchestrationContext
): Promise<ReactNode> {
  let resolved: SmithersOrchestration | ReactNode | undefined = orchestration

  if (typeof orchestration === 'string') {
    const modulePath = path.isAbsolute(orchestration)
      ? orchestration
      : path.resolve(process.cwd(), orchestration)
    const moduleUrl = pathToFileURL(modulePath).href
    const mod = await import(moduleUrl)
    resolved = mod.default ?? mod.orchestration ?? mod.App ?? mod.Workflow
  }

  if (typeof resolved === 'function') {
    return await resolved(context)
  }

  if (resolved === undefined) {
    throw new Error('Orchestration module did not export a usable orchestration')
  }

  return resolved
}

function wrapWithProvider(
  node: ReactNode,
  db: SmithersDB,
  executionId: string,
  config?: SmithersConfig,
  orchestrationToken?: string
): ReactNode {
  if (isValidElement(node) && node.type === SmithersProvider) {
    // If already a SmithersProvider but missing token, clone with token
    const props = node.props as { orchestrationToken?: string }
    if (orchestrationToken && !props.orchestrationToken) {
      return cloneElement(node as React.ReactElement<{ orchestrationToken?: string }>, { orchestrationToken })
    }
    return node
  }

  return createElement(
    SmithersProvider,
    {
      db,
      executionId,
      ...(config ? { config } : {}),
      ...(orchestrationToken ? { orchestrationToken } : {}),
      children: node
    }
  )
}

function readTableRows(db: SmithersDB, executionId: string, table: SmithersTable): Record<string, unknown>[] {
  if (table === 'executions') {
    return db.db.query('SELECT * FROM executions WHERE id = ?', [executionId])
  }

  if (table === 'state') {
    return db.db.query('SELECT * FROM state')
  }

  const orderBy = TABLE_ORDER[table]
  const orderSql = orderBy ? ` ORDER BY ${orderBy}` : ''
  return db.db.query(
    `SELECT * FROM ${table} WHERE execution_id = ?${orderSql}`,
    [executionId]
  )
}

function mapExecutionStatus(status: string | null | undefined, stopRequested: boolean): SessionStatus {
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'stopped'
  if (status === 'completed' && stopRequested) return 'stopped'
  if (status === 'completed') return 'completed'
  if (status === 'running') return 'running'
  return 'idle'
}

// ============================================================================
// TRANSPORT
// ============================================================================

export class SmithersChatTransport implements ChatTransport<SmithersMessage, SmithersChunk> {
  private sessions = new Map<string, ChatSession>()
  private singleChatId: string | null = null

  constructor(private options: SmithersChatTransportOptions) {}

  async sendMessages(options: ChatTransportSendOptions<SmithersMessage>): Promise<ReadableStream<SmithersChunk>> {
    const session = await this.getOrCreateSession(options.chatId)
    this.persistMessages(session, options)
    this.attachAbort(session, options)
    this.startSessionIfNeeded(session, options)
    return this.createStream(session, options)
  }

  async reconnectToStream(
    options: ChatTransportReconnectOptions
  ): Promise<ReadableStream<SmithersChunk> | null> {
    const existing = this.sessions.get(options.chatId)
    if (existing) {
      return this.createStream(existing, {
        trigger: 'submit-message',
        chatId: options.chatId,
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      })
    }

    const session = await this.loadSessionFromDisk(options.chatId)
    if (!session) return null

    return this.createStream(session, {
      trigger: 'submit-message',
      chatId: options.chatId,
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    })
  }

  private async getOrCreateSession(chatId: string): Promise<ChatSession> {
    const existing = this.sessions.get(chatId)
    if (existing) return existing

    const { path: dbPath, isTemplate } = resolveDbPath(this.options.dbPath, chatId)
    if (!isTemplate) {
      if (this.singleChatId && this.singleChatId !== chatId) {
        throw new Error(`Transport dbPath does not support multiple chatIds (${this.singleChatId} already active)`)
      }
      this.singleChatId = chatId
    }

    ensureDbDirectory(dbPath)
    const db = createSmithersDB({ path: dbPath })

    const executionName = this.options.executionName ?? `chat:${chatId}`
    const filePath =
      typeof this.options.orchestration === 'string'
        ? this.options.orchestration
        : this.options.executionFilePath ?? 'smithers-chat'
    const executionId = db.execution.start(executionName, filePath, {
      ...this.options.config,
      chatId,
    })

    db.state.set('chat:id', chatId, 'chat-init')
    db.state.set('chat:executionId', executionId, 'chat-init')

    const session: ChatSession = {
      chatId,
      dbPath,
      db,
      executionId,
      root: null,
      status: 'idle',
      controllers: new Set(),
    }

    this.sessions.set(chatId, session)
    return session
  }

  private attachAbort(session: ChatSession, options: ChatTransportSendOptions<SmithersMessage>): void {
    if (!options.abortSignal) return

    const handleAbort = () => {
      session.db.state.set('stop_requested', {
        reason: 'abort',
        timestamp: Date.now(),
        chatId: session.chatId,
      }, 'chat-abort')
    }

    if (options.abortSignal.aborted) {
      handleAbort()
      return
    }

    options.abortSignal.addEventListener('abort', handleAbort, { once: true })
  }

  private persistMessages(session: ChatSession, options: ChatTransportSendOptions<SmithersMessage>): void {
    session.db.state.set('chat:messages', options.messages, 'chat-messages')
    session.db.state.set('chat:lastMessageId', options.messageId ?? null, 'chat-messages')
  }

  private startSessionIfNeeded(session: ChatSession, options: ChatTransportSendOptions<SmithersMessage>): void {
    if (session.startPromise) return

    session.status = 'running'
    this.broadcastStatus(session)

    session.startPromise = (async () => {
      const root = createSmithersRoot()
      session.root = root

      // Create orchestration promise for completion signaling
      const { promise: orchestrationPromise, token: orchestrationToken } = createOrchestrationPromise()

      const orchestrationNode = await resolveOrchestration(this.options.orchestration, {
        chatId: session.chatId,
        executionId: session.executionId,
        db: session.db,
        messages: options.messages,
        trigger: options.trigger,
      })

      // Pass token to SmithersProvider so it can signal completion
      const wrapped = wrapWithProvider(
        orchestrationNode,
        session.db,
        session.executionId,
        this.options.config,
        orchestrationToken
      )

      // Use render() instead of mount() to avoid duplicate orchestration promise
      // and wait for our orchestration promise with the token we control
      await root.render(wrapped)

      // Wait for SmithersProvider to signal completion
      await orchestrationPromise

      const stopRequested = session.db.state.get('stop_requested') !== null
      if (stopRequested) {
        session.db.execution.cancel(session.executionId)
        session.status = 'stopped'
      } else {
        session.db.execution.complete(session.executionId)
        session.status = 'completed'
      }
    })()
      .catch((err) => {
        session.error = err instanceof Error ? err.message : String(err)
        session.db.execution.fail(session.executionId, session.error)
        session.status = 'failed'
      })
      .finally(() => {
        session.root?.dispose()
        session.root = null
        this.broadcastStatus(session)
        this.closeIfComplete(session)
      })
  }

  private closeIfComplete(session: ChatSession): void {
    if (session.status === 'running' || session.status === 'idle') return
    for (const controller of session.controllers) {
      try {
        controller.close()
      } catch {
        // ignore
      }
    }
    session.controllers.clear()
  }

  private broadcastStatus(session: ChatSession): void {
    const status = session.status === 'running' ? 'started' : session.status
    if (status === 'idle') return

    const chunk: SmithersChunk = {
      type: 'status',
      status,
      chatId: session.chatId,
      executionId: session.executionId,
      ...(session.error ? { error: session.error } : {}),
    }

    for (const controller of session.controllers) {
      try {
        controller.enqueue(chunk)
      } catch {
        // ignore closed streams
      }
    }
  }

  private createStream(
    session: ChatSession,
    options: ChatTransportSendOptions<SmithersMessage>
  ): ReadableStream<SmithersChunk> {
    const tables = this.options.tables ?? DEFAULT_TABLES
    let streamController: ReadableStreamDefaultController<SmithersChunk> | null = null
    let subscriptions: Array<() => void> = []

    return new ReadableStream<SmithersChunk>({
      start: (controller) => {
        streamController = controller
        session.controllers.add(controller)

        const currentStatus = session.status === 'running' ? 'started' : session.status
        if (currentStatus !== 'idle') {
          controller.enqueue({
            type: 'status',
            status: currentStatus,
            chatId: session.chatId,
            executionId: session.executionId,
            ...(session.error ? { error: session.error } : {}),
          })
        }

        for (const message of options.messages) {
          controller.enqueue({
            type: 'message',
            message,
          })
        }

        for (const table of tables) {
          controller.enqueue({
            type: 'table',
            table,
            rows: readTableRows(session.db, session.executionId, table),
            isSnapshot: true,
          })
        }

        subscriptions = tables.map((table) =>
          session.db.db.subscribe([table], () => {
            try {
              streamController?.enqueue({
                type: 'table',
                table,
                rows: readTableRows(session.db, session.executionId, table),
                isSnapshot: false,
              })
            } catch {
              // ignore enqueue failures on closed streams
            }
          })
        )
      },
      cancel: () => {
        for (const unsubscribe of subscriptions) {
          unsubscribe()
        }
        subscriptions = []
        if (streamController) {
          session.controllers.delete(streamController)
          streamController = null
        }
      },
    })
  }

  private async loadSessionFromDisk(chatId: string): Promise<ChatSession | null> {
    const { path: dbPath } = resolveDbPath(this.options.dbPath, chatId)
    if (isMemoryDbPath(dbPath)) return null
    if (!fs.existsSync(dbPath)) return null

    const db = createSmithersDB({ path: dbPath })
    const executionId =
      db.state.get<string>('chat:executionId') ??
      db.db.queryOne<{ id: string }>('SELECT id FROM executions ORDER BY created_at DESC LIMIT 1')?.id

    if (!executionId) {
      db.close()
      return null
    }

    const execution = db.db.queryOne<{ status: string; error: string | null }>(
      'SELECT status, error FROM executions WHERE id = ?',
      [executionId]
    )

    const stopRequested = db.state.get('stop_requested') !== null
    const status = mapExecutionStatus(execution?.status, stopRequested)

    const session: ChatSession = {
      chatId,
      dbPath,
      db,
      executionId,
      root: null,
      status,
      ...(execution?.error ? { error: execution.error } : {}),
      controllers: new Set(),
    }

    this.sessions.set(chatId, session)
    return session
  }
}
