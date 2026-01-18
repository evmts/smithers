/**
 * Unit tests for ReportTool.ts
 */
import { describe, test, expect, mock } from 'bun:test'
import { createReportTool, getReportToolDescription } from './ReportTool'

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
  }

  test('returns a tool with correct name', () => {
    const tool = createReportTool(mockContext as any)
    expect(tool.name).toBe('Report')
  })

  test('has description', () => {
    const tool = createReportTool(mockContext as any)
    expect(tool.description).toBeDefined()
    expect(tool.description.length).toBeGreaterThan(0)
  })

  test('has input schema', () => {
    const tool = createReportTool(mockContext as any)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.inputSchema.type).toBe('object')
    expect(tool.inputSchema.properties).toBeDefined()
  })

  test('input schema has required fields', () => {
    const tool = createReportTool(mockContext as any)
    expect(tool.inputSchema.required).toContain('type')
    expect(tool.inputSchema.required).toContain('title')
    expect(tool.inputSchema.required).toContain('content')
  })

  test('input schema has type enum', () => {
    const tool = createReportTool(mockContext as any)
    const typeProperty = tool.inputSchema.properties?.type as any
    expect(typeProperty.enum).toContain('progress')
    expect(typeProperty.enum).toContain('finding')
    expect(typeProperty.enum).toContain('warning')
    expect(typeProperty.enum).toContain('error')
    expect(typeProperty.enum).toContain('metric')
    expect(typeProperty.enum).toContain('decision')
  })

  test('input schema has severity enum', () => {
    const tool = createReportTool(mockContext as any)
    const severityProperty = tool.inputSchema.properties?.severity as any
    expect(severityProperty.enum).toContain('info')
    expect(severityProperty.enum).toContain('warning')
    expect(severityProperty.enum).toContain('critical')
  })

  test('has execute function', () => {
    const tool = createReportTool(mockContext as any)
    expect(typeof tool.execute).toBe('function')
  })

  test('execute calls addReport with correct data', async () => {
    const addReport = mock(async () => 'report-456')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
    }

    const tool = createReportTool(context as any)
    await tool.execute({
      type: 'progress',
      title: 'Test Progress',
      content: 'Progress update content',
    })

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
    }

    const tool = createReportTool(context as any)
    const result = await tool.execute({
      type: 'finding',
      title: 'Test Finding',
      content: 'Finding content',
    })

    expect(result.success).toBe(true)
    expect(result.reportId).toBe('report-789')
    expect(result.message).toContain('Test Finding')
  })

  test('defaults severity to critical for error type', async () => {
    const addReport = mock(async () => 'report-err')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
    }

    const tool = createReportTool(context as any)
    await tool.execute({
      type: 'error',
      title: 'Test Error',
      content: 'Error content',
    })

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' })
    )
  })

  test('defaults severity to warning for warning type', async () => {
    const addReport = mock(async () => 'report-warn')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
    }

    const tool = createReportTool(context as any)
    await tool.execute({
      type: 'warning',
      title: 'Test Warning',
      content: 'Warning content',
    })

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' })
    )
  })

  test('uses provided severity over default', async () => {
    const addReport = mock(async () => 'report-custom')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
    }

    const tool = createReportTool(context as any)
    await tool.execute({
      type: 'error',
      title: 'Test Error',
      content: 'Error content',
      severity: 'info', // Override critical default
    })

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info' })
    )
  })

  test('includes data in report', async () => {
    const addReport = mock(async () => 'report-data')
    const context = {
      db: { vcs: { addReport } },
      agentId: 'agent-123',
    }

    const tool = createReportTool(context as any)
    await tool.execute({
      type: 'metric',
      title: 'Test Metric',
      content: 'Metric content',
      data: { value: 42, unit: 'ms' },
    })

    expect(addReport).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { value: 42, unit: 'ms' },
      })
    )
  })
})
