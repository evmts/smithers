import { isValidElement, type ReactNode, type ReactElement } from 'react'

export function extractText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>
    return extractText(element.props.children)
  }
  return String(node)
}
