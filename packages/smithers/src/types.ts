/**
 * Core type definitions for Smithers
 */

export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', 'ROOT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
}
