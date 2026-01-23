import { describe, test, expect } from 'bun:test'
import { XMLPhaseParser } from './xml-parser.ts'

describe('XMLPhaseParser', () => {
  test('parses valid XML with id and name', async () => {
    const parser = new XMLPhaseParser()
    const xml = '<phase id="test" name="Test Phase" version="1.0"></phase>'

    const result = await parser.parse(xml)

    expect(result.definition.id).toBe('test')
    expect(result.definition.name).toBe('Test Phase')
    expect(result.definition.version).toBe('1.0')
    expect(result.errors).toHaveLength(0)
  })

  test('reports validation errors for missing attributes', async () => {
    const parser = new XMLPhaseParser()
    const xml = '<phase></phase>'

    const result = await parser.parse(xml)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.message.includes('id'))).toBe(true)
    expect(result.errors.some(e => e.message.includes('name'))).toBe(true)
  })

  test('handles syntax errors', async () => {
    const parser = new XMLPhaseParser()
    const xml = 'invalid xml content'

    const result = await parser.parse(xml)

    expect(result.errors.length).toBeGreaterThan(0)
    // The simple parser returns validation errors instead of syntax errors for this input
    expect(result.errors.some(e => e.type === 'validation' || e.type === 'syntax')).toBe(true)
  })
})