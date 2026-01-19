/**
 * Tests for src/tui/components/shared/XMLViewer.tsx
 */

import { describe, test, expect } from 'bun:test'
import { XMLViewer, getLineColor } from './XMLViewer.js'
import { colors } from '../../utils/colors.js'

function flattenChildren(children: unknown): unknown[] {
  if (children === null || children === undefined || children === false) return []
  if (Array.isArray(children)) return children.flatMap(flattenChildren)
  return [children]
}

describe('tui/components/shared/XMLViewer', () => {
  test('getLineColor classifies XML line types', () => {
    expect(getLineColor('<!-- comment -->')).toBe(colors.comment)
    expect(getLineColor('<selfClosing/>')).toBe(colors.cyan)
    expect(getLineColor('<opening>')).toBe(colors.blue)
    expect(getLineColor('</closing>')).toBe(colors.purple)
    expect(getLineColor('<tag attr="value">')).toBe(colors.blue)
    expect(getLineColor('plain text')).toBe(colors.fg)
  })

  test('XMLViewer truncates and shows a remaining line indicator', () => {
    const xml = ['<a>', '<b/>', '</a>'].join('\n')
    const element = XMLViewer({ xml, maxLines: 2 })
    const children = flattenChildren(element.props.children)
    const indicator = children[children.length - 1]
    expect(indicator.props.content).toBe('... 1 more lines')
  })

  test('XMLViewer renders all lines when under maxLines', () => {
    const xml = ['<a>', '<b/>'].join('\n')
    const element = XMLViewer({ xml, maxLines: 5 })
    const children = flattenChildren(element.props.children)
    expect(children).toHaveLength(2)
  })
})
