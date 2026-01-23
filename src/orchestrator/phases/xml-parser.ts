import type {
  WorkflowPhase,
  PhaseTransition,
  TransitionCondition,
  WorkflowDefinition
} from '../types/workflow-types.js'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

export class XmlParser {
  /**
   * Parse a phase definition from XML
   */
  parsePhaseDefinition(xml: string): WorkflowPhase {
    const doc = this.parseXml(xml)
    const phaseElement = doc.documentElement?.tagName === 'phase'
      ? doc.documentElement
      : this.getElement(doc, 'phase')

    const id = this.getAttribute(phaseElement, 'id')
    if (!id) throw new Error('Phase must have an id attribute')

    const name = this.getElementText(phaseElement, 'name') || id
    const description = this.getElementText(phaseElement, 'description')
    const type = this.getAttribute(phaseElement, 'type') as any || 'agent-driven'

    const config = this.parseConfig(phaseElement)
    const transitions = this.parseTransitionsFromElement(phaseElement)

    const timeoutStr = this.getElementText(phaseElement, 'timeout') || config.timeout
    const timeout = timeoutStr ? parseInt(timeoutStr, 10) : undefined

    return {
      id,
      name,
      description,
      type,
      config,
      transitions,
      timeout
    }
  }

  /**
   * Parse transitions from XML
   */
  parseTransitions(xml: string): PhaseTransition[] {
    const doc = this.parseXml(xml)
    // Use the document element directly if it's the transitions element
    const transitionsElement = doc.documentElement?.tagName === 'transitions'
      ? doc.documentElement
      : this.getElement(doc, 'transitions')
    return this.parseTransitionsFromElement(transitionsElement)
  }

  /**
   * Parse a complete workflow definition from XML
   */
  parseWorkflowDefinition(xml: string): WorkflowDefinition {
    const doc = this.parseXml(xml)
    const workflowElement = doc.documentElement?.tagName === 'workflow'
      ? doc.documentElement
      : this.getElement(doc, 'workflow')

    const id = this.getAttribute(workflowElement, 'id')
    if (!id) throw new Error('Workflow must have an id attribute')

    const name = this.getAttribute(workflowElement, 'name') || id
    const description = this.getAttribute(workflowElement, 'description')
    const version = this.getAttribute(workflowElement, 'version') || '1.0.0'

    const initialPhase = this.getElementText(workflowElement, 'initial-phase')
    if (!initialPhase) throw new Error('Workflow must specify an initial phase')

    const context = this.parseContext(workflowElement)
    const phases = this.parsePhasesFromElement(workflowElement)

    return {
      id,
      name,
      description,
      version,
      phases,
      initialPhase,
      context
    }
  }

  /**
   * Extract structured output from agent response
   */
  extractStructuredOutput(response: string): Record<string, any> {
    const structuredMatch = response.match(/<structured[^>]*>([\s\S]*?)<\/structured>/i)
    if (!structuredMatch) return {}

    try {
      const structuredXml = `<root>${structuredMatch[1]}</root>`
      const doc = this.parseXml(structuredXml)
      return this.xmlToObject(doc.documentElement)
    } catch (error) {
      console.warn('Failed to parse structured output:', error)
      return {}
    }
  }

  private parseXml(xml: string): Document {
    if (!xml.trim()) {
      throw new Error('XML content is empty')
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    // Check for parsing errors in xmldom
    if (doc.documentElement?.tagName === 'parsererror') {
      throw new Error(`XML parsing error: ${doc.documentElement.textContent}`)
    }

    return doc
  }


  private getElement(doc: Document | Element, tagName: string): Element {
    let element: Element | null = null

    // Check if it's a document (has documentElement property)
    if ('documentElement' in doc) {
      element = doc.getElementsByTagName(tagName)[0] || null
    } else {
      element = doc.getElementsByTagName(tagName)[0] || null
    }

    if (!element) {
      throw new Error(`Required element '${tagName}' not found`)
    }
    return element
  }

  private getAttribute(element: Element, name: string): string | null {
    return element.getAttribute(name)
  }

  private getElementText(element: Element, tagName: string): string | null {
    const child = element.getElementsByTagName(tagName)[0]
    return child?.textContent?.trim() || null
  }

  private parseConfig(phaseElement: Element): Record<string, any> {
    const configElement = phaseElement.getElementsByTagName('config')[0]
    if (!configElement) return {}

    const config: Record<string, any> = {}

    // Get all child elements directly
    for (let i = 0; i < configElement.childNodes.length; i++) {
      const child = configElement.childNodes[i]
      if (child.nodeType === 1) { // Element node
        const element = child as Element
        const key = element.tagName.toLowerCase()
        const value = element.textContent?.trim()

        if (value) {
          // Try to parse as number, boolean, or keep as string
          config[key] = this.parseValue(value)
        }
      }
    }

    return config
  }

  private parseTransitionsFromElement(element: Element): PhaseTransition[] {
    // If the element itself is a transitions element, use it directly
    const transitionsElement = element.tagName === 'transitions'
      ? element
      : element.getElementsByTagName('transitions')[0]

    if (!transitionsElement) return []

    const transitions: PhaseTransition[] = []
    const transitionElements = transitionsElement.getElementsByTagName('transition')

    for (let i = 0; i < transitionElements.length; i++) {
      const transitionElement = transitionElements[i]
      const transition = this.parseTransition(transitionElement)
      transitions.push(transition)
    }

    return transitions
  }

  private parseTransition(element: Element): PhaseTransition {
    const id = this.getAttribute(element, 'id') || `transition-${Date.now()}`
    const targetPhase = this.getAttribute(element, 'target')
    if (!targetPhase) {
      throw new Error('Transition must have a target attribute')
    }

    const priorityStr = this.getAttribute(element, 'priority')
    const priority = priorityStr ? parseInt(priorityStr, 10) : 50

    const condition = this.parseCondition(element)

    return {
      id,
      targetPhase,
      condition,
      priority
    }
  }

  private parseCondition(transitionElement: Element): TransitionCondition {
    const conditionElement = transitionElement.getElementsByTagName('condition')[0]
    if (!conditionElement) {
      // Default to 'always' condition
      return { type: 'always', config: {} }
    }

    const type = this.getAttribute(conditionElement, 'type') as any || 'always'
    const config: Record<string, any> = {}

    // Parse condition-specific configuration
    switch (type) {
      case 'output-contains':
        const pattern = this.getElementText(conditionElement, 'pattern')
        if (pattern) config.pattern = pattern
        break

      case 'structured-field-equals':
        const field = this.getElementText(conditionElement, 'field')
        const value = this.getElementText(conditionElement, 'value')
        if (field) config.field = field
        if (value) config.value = this.parseValue(value)
        break

      case 'exit-code':
        const code = this.getElementText(conditionElement, 'code')
        if (code) config.code = parseInt(code, 10)
        break

      case 'composite':
        const operator = this.getElementText(conditionElement, 'operator') || 'and'
        config.operator = operator
        config.conditions = this.parseCompositeConditions(conditionElement)
        break

      default:
        // For 'always', 'never', and other simple types, no config needed
        break
    }

    return { type, config }
  }

  private parseCompositeConditions(conditionElement: Element): TransitionCondition[] {
    const conditionsElement = conditionElement.getElementsByTagName('conditions')[0]
    if (!conditionsElement) return []

    const conditions: TransitionCondition[] = []
    const conditionElements = conditionsElement.getElementsByTagName('condition')

    for (let i = 0; i < conditionElements.length; i++) {
      const child = conditionElements[i]
      // Create a temporary transition element to parse the condition
      const doc = conditionElement.ownerDocument || new DOMParser().parseFromString('<transition></transition>', 'text/xml')
      const tempTransition = doc.createElement('transition')
      tempTransition.appendChild(child.cloneNode(true))
      conditions.push(this.parseCondition(tempTransition))
    }

    return conditions
  }

  private parseContext(workflowElement: Element): Record<string, any> {
    const contextElement = workflowElement.getElementsByTagName('context')[0]
    if (!contextElement) return {}

    return this.xmlToObject(contextElement)
  }

  private parsePhasesFromElement(workflowElement: Element): WorkflowPhase[] {
    const phasesElement = workflowElement.getElementsByTagName('phases')[0]
    if (!phasesElement) return []

    const phases: WorkflowPhase[] = []
    const phaseElements = phasesElement.getElementsByTagName('phase')

    for (let i = 0; i < phaseElements.length; i++) {
      const child = phaseElements[i]
      const phaseXml = new XMLSerializer().serializeToString(child)
      const phase = this.parsePhaseDefinition(phaseXml)
      phases.push(phase)
    }

    return phases
  }

  private xmlToObject(element: Element): Record<string, any> {
    const result: Record<string, any> = {}

    // Handle attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i]
        result[attr.name] = this.parseValue(attr.value)
      }
    }

    // Handle child elements
    const childElements: Element[] = []
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i]
      if (child.nodeType === 1) { // Element node
        childElements.push(child as Element)
      }
    }

    for (const child of childElements) {
      const key = child.tagName
      const hasChildElements = Array.from(child.childNodes).some(node => node.nodeType === 1)
      const value = hasChildElements
        ? this.xmlToObject(child)
        : this.parseValue(child.textContent?.trim() || '')

      if (result[key]) {
        // Convert to array if multiple elements with same name
        if (Array.isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [result[key], value]
        }
      } else {
        result[key] = value
      }
    }

    // If no children and no attributes, return text content
    if (Object.keys(result).length === 0 && element.textContent) {
      return this.parseValue(element.textContent.trim())
    }

    return result
  }

  private parseValue(value: string): any {
    if (!value) return value

    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10)
    }

    if (/^\d*\.\d+$/.test(value)) {
      return parseFloat(value)
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false

    // Return as string
    return value
  }
}