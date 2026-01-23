import { describe, test, expect, beforeEach } from 'bun:test'
import { XmlParser } from './xml-parser.js'

describe('XmlParser', () => {
  let parser: XmlParser

  beforeEach(() => {
    parser = new XmlParser()
  })

  test('should parse simple XML with phase definition', () => {
    const xml = `
      <phase id="analysis">
        <name>Code Analysis</name>
        <description>Analyze the codebase for issues</description>
        <config>
          <model>claude-3-sonnet-20241022</model>
          <timeout>30000</timeout>
        </config>
      </phase>
    `

    const result = parser.parsePhaseDefinition(xml)

    expect(result.id).toBe('analysis')
    expect(result.name).toBe('Code Analysis')
    expect(result.description).toBe('Analyze the codebase for issues')
    expect(result.config.model).toBe('claude-3-sonnet-20241022')
    expect(result.config.timeout).toBe(30000)
  })

  test('should parse phase transitions', () => {
    const xml = `
      <transitions>
        <transition id="to-fix" target="fix-phase" priority="100">
          <condition type="output-contains">
            <pattern>issues_found</pattern>
          </condition>
        </transition>
        <transition id="to-complete" target="complete" priority="50">
          <condition type="always" />
        </transition>
      </transitions>
    `

    const result = parser.parseTransitions(xml)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('to-fix')
    expect(result[0].targetPhase).toBe('fix-phase')
    expect(result[0].priority).toBe(100)
    expect(result[0].condition.type).toBe('output-contains')
    expect(result[0].condition.config.pattern).toBe('issues_found')

    expect(result[1].id).toBe('to-complete')
    expect(result[1].targetPhase).toBe('complete')
    expect(result[1].condition.type).toBe('always')
  })

  test('should parse workflow definition', () => {
    const xml = `
      <workflow id="ci-pipeline" name="CI Pipeline" version="1.0.0">
        <initial-phase>build</initial-phase>
        <context>
          <repository>test-repo</repository>
          <branch>main</branch>
        </context>
        <phases>
          <phase id="build" name="Build" type="agent-driven">
            <config>
              <model>claude-3-sonnet-20241022</model>
            </config>
            <transitions>
              <transition target="test" priority="100">
                <condition type="success" />
              </transition>
            </transitions>
          </phase>
        </phases>
      </workflow>
    `

    const result = parser.parseWorkflowDefinition(xml)

    expect(result.id).toBe('ci-pipeline')
    expect(result.name).toBe('CI Pipeline')
    expect(result.version).toBe('1.0.0')
    expect(result.initialPhase).toBe('build')
    expect(result.context.repository).toBe('test-repo')
    expect(result.phases).toHaveLength(1)
    expect(result.phases[0].id).toBe('build')
    expect(result.phases[0].transitions).toHaveLength(1)
  })

  test('should handle malformed XML gracefully', () => {
    const malformedXml = '<phase><name>Test</name>'

    expect(() => parser.parsePhaseDefinition(malformedXml)).toThrow()
  })

  test('should handle empty XML', () => {
    expect(() => parser.parsePhaseDefinition('')).toThrow()
  })

  test('should parse complex conditions', () => {
    const xml = `
      <transition target="next">
        <condition type="composite">
          <operator>and</operator>
          <conditions>
            <condition type="output-contains">
              <pattern>success</pattern>
            </condition>
            <condition type="exit-code">
              <code>0</code>
            </condition>
          </conditions>
        </condition>
      </transition>
    `

    const result = parser.parseTransitions(`<transitions>${xml}</transitions>`)

    expect(result[0].condition.type).toBe('composite')
    expect(result[0].condition.config.operator).toBe('and')
    expect(result[0].condition.config.conditions).toHaveLength(2)
  })

  test('should extract structured output from agent response', () => {
    const response = `
      Here's my analysis:

      <structured>
        <decision>continue</decision>
        <issues_found>3</issues_found>
        <next_action>fix_linting</next_action>
        <metadata>
          <confidence>0.95</confidence>
        </metadata>
      </structured>

      The code has some issues that need attention.
    `

    const result = parser.extractStructuredOutput(response)

    expect(result.decision).toBe('continue')
    expect(result.issues_found).toBe(3) // Should be converted to number
    expect(result.next_action).toBe('fix_linting')
    expect(result.metadata.confidence).toBe(0.95) // Should be converted to number
  })

  test('should handle response without structured output', () => {
    const response = 'This is just a plain text response without XML.'

    const result = parser.extractStructuredOutput(response)

    expect(result).toEqual({})
  })
})