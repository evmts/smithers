/**
 * Unit tests for ReportTool.ts
 */
import { describe, test, expect, mock } from 'bun:test'
import { createReportTool, getReportToolDescription } from './ReportTool.js'

describe('getReportToolDescription', () => {
  test('returns a non-empty string', () => {
    const description = getReportToolDescription()
    expect(typeof description).toBe('string')
    expect(description.length).toBeGreaterThan(0)
  })

  test('contains Report Tool header', () => {
    const description = getReportToolDescription()
    expect(description).toContain('## Report Tool')
  })

  test('describes report types', () => {
    const description = getReportToolDescription()
    expect(description).toContain('progress')
    expect(description).toContain('findings')
    expect(description).toContain('warnings')
    expect(description).toContain('errors')
    expect(description).toContain('metrics')
    expect(description).toContain('decisions')
  })

  test('includes example usage', () => {
    const description = getReportToolDescription()
    expect(description).toContain('Example usage')
    expect(description).toContain('"type": "finding"')
    expect(description).toContain('"title"')
    expect(description).toContain('"content"')
  })

  test('mentions severity levels', () => {
    const description = getReportToolDescription()
    expect(description).toContain('severity')
    expect(description).toContain('critical')
  })
})

describe('createReportTool', () => {
  // Create a mock context
  const mockAddReport = mock(async () => 'report-123')
  const mockContext = {
    db: {
      vcs: {
        addReport: mockAddReport,
      },
    },
    agentId: 'test-agent',
    executionId: 'exec-1',
    cwd: '/tmp',
    env: {},
    log: mock(() => {}),
  }

  test('returns a tool with correct name', () => {
    const tool = createReportTool()
    expect(tool.name).toBe('Report')
  })

  test('has description', () => {
    const tool = createReportTool()
    expect(tool.description).toBeDefined()
    expect(tool.description.length).toBeGreaterThan(0)
  })

  test('has input schema', () => {
    const tool = createReportTool()
    expect(tool.inputSchema).toBeDefined()
    expect(typeof tool.inputSchema.safeParse).toBe('function')
  })

  test('input schema has required fields', () => {
    const tool = createReportTool()
    const shape = (tool.inputSchema as any).shape
    expect(shape.type).toBeDefined()
    expect(shape.title).toBeDefined()
    expect(shape.content).toBeDefined()
  })

  test('input schema has type enum', () => {
    const tool = createReportTool()
    const typeSchema = (tool.inputSchema as any).shape.type
    expect(typeSchema.options).toContain('progress')
    expect(typeSchema.options).toContain('finding')
    expect(typeSchema.options).toContain('warning')
    expect(typeSchema.options).toContain('error')
    expect(typeSchema.options).toContain('metric')
    expect(typeSchema.options).toContain('decision')
  })

  test('input schema has severity enum', () => {
    const tool = createReportTool()
    const severitySchema = (tool.inputSchema as any).shape.severity
    expect(severitySchema._def.innerType.options).toContain('info')
    expect(severitySchema._def.innerType.options).toContain('warning')
    expect(severitySchema._def.innerType.options).toContain('critical')
  })

  test('has execute function', () => {
    const tool = createReportTool()
    expect(typeof tool.execute).toBe('function')
  })

  test('execute calls addReport with correct data', async () => {
    const addReport = mock(async () => 'report-456')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-2',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    await tool.execute(
      {
        type: 'progress',
        title: 'Test Progress',
        content: 'Progress update content',
      },
      {
        toolCallId: 'call-1',
        messages: [],
        experimental_context: context,
      }
    )

    expect(addReport).toHaveBeenCalledWith({
      type: 'progress',
      title: 'Test Progress',
      content: 'Progress update content',
      data: undefined,
      severity: 'info',
      agent_id: 'agent-123',
    })
  })

  test('execute returns success with reportId', async () => {
    const addReport = mock(async () => 'report-789')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-3',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    const result = await tool.execute(
      {
        type: 'finding',
        title: 'Test Finding',
        content: 'Finding content',
      },
      {
        toolCallId: 'call-2',
        messages: [],
        experimental_context: context,
      }
    )

    expect(result.success).toBe(true)
    expect(result.reportId).toBe('report-789')
    expect(result.message).toContain('Test Finding')
  })

  test('defaults severity to critical for error type', async () => {
    const addReport = mock(async () => 'report-err')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-4',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    await tool.execute(
      {
        type: 'error',
        title: 'Test Error',
        content: 'Error content',
      },
      {
        toolCallId: 'call-3',
        messages: [],
        experimental_context: context,
      }
    )

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' })
    )
  })

  test('defaults severity to warning for warning type', async () => {
    const addReport = mock(async () => 'report-warn')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-5',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    await tool.execute(
      {
        type: 'warning',
        title: 'Test Warning',
        content: 'Warning content',
      },
      {
        toolCallId: 'call-4',
        messages: [],
        experimental_context: context,
      }
    )

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' })
    )
  })

  test('uses provided severity over default', async () => {
    const addReport = mock(async () => 'report-custom')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-6',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    await tool.execute(
      {
        type: 'error',
        title: 'Test Error',
        content: 'Error content',
        severity: 'info', // Override critical default
      },
      {
        toolCallId: 'call-5',
        messages: [],
        experimental_context: context,
      }
    )

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info' })
    )
  })

  test('includes data in report', async () => {
    const addReport = mock(async () => 'report-data')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
      executionId: 'exec-7',
      cwd: '/tmp',
      env: {},
      log: mock(() => {}),
    }

    const tool = createReportTool()
    await tool.execute(
      {
        type: 'metric',
        title: 'Test Metric',
        content: 'Metric content',
        data: { value: 42, unit: 'ms' },
      },
      {
        toolCallId: 'call-6',
        messages: [],
        experimental_context: context,
      }
    )

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { value: 42, unit: 'ms' },
      })
    )
  })
})
