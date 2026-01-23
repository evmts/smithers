// Simplified XML parser for dynamic phases
import type { PhaseDefinition, ParsedXMLPhase, XMLParseError } from './types.ts'

export class XMLPhaseParser {
  async parse(xmlContent: string): Promise<ParsedXMLPhase> {
    // Simple parsing for demo - extract basic info from XML
    const errors: XMLParseError[] = []
    const warnings: any[] = []

    try {
      // Simple regex-based parsing for testing
      const idMatch = xmlContent.match(/id="([^"]*)"/)
      const nameMatch = xmlContent.match(/name="([^"]*)"/)
      const versionMatch = xmlContent.match(/version="([^"]*)"/)

      const id = idMatch ? idMatch[1] : ''
      const name = nameMatch ? nameMatch[1] : ''
      const version = versionMatch ? versionMatch[1] : '1.0'

      if (!id) {
        errors.push({
          type: 'validation',
          message: 'Phase must have an id attribute'
        })
      }

      if (!name) {
        errors.push({
          type: 'validation',
          message: 'Phase must have a name attribute'
        })
      }

      const definition: PhaseDefinition = {
        id,
        name,
        version,
        steps: [{
          id: 'step1',
          name: 'Test Step',
          type: 'action'
        }],
        transitions: [],
        initialStep: 'step1',
        finalSteps: ['step1'],
        variables: {}
      }

      return { definition, errors, warnings }

    } catch (error) {
      errors.push({
        type: 'syntax',
        message: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        definition: this.getEmptyDefinition(),
        errors,
        warnings: []
      }
    }
  }

  private getEmptyDefinition(): PhaseDefinition {
    return {
      id: '',
      name: '',
      version: '1.0',
      steps: [],
      transitions: [],
      initialStep: '',
      finalSteps: [],
      variables: {}
    }
  }
}