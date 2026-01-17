/**
 * Phase 1: Core Renderer Tests (NO JSX)
 *
 * These tests validate the renderer by directly calling its methods,
 * without JSX transpilation complexity. This proves the architecture works
 * before we tackle vite-plugin-solid configuration.
 *
 * CRITICAL TEST: replaceText() - ensures signal updates work correctly
 */

import { describe, it, expect } from 'vitest'
import { rendererMethods } from './renderer'
import type { SmithersNode } from '../core/types'

describe('Smithers Renderer Core (Direct Method Calls)', () => {
  describe('createElement', () => {
    it('should create a basic element node', () => {
      const node = rendererMethods.createElement('task')

      expect(node.type).toBe('task')
      expect(node.props).toEqual({})
      expect(node.children).toEqual([])
      expect(node.parent).toBe(null)
    })
  })

  describe('createTextNode', () => {
    it('should create a TEXT node with value', () => {
      const node = rendererMethods.createTextNode('Hello World')

      expect(node.type).toBe('TEXT')
      expect(node.props.value).toBe('Hello World')
      expect(node.children).toEqual([])
      expect(node.parent).toBe(null)
    })
  })

  describe('replaceText (CRITICAL for signals)', () => {
    it('should mutate TEXT node value in-place', () => {
      const node = rendererMethods.createTextNode('Initial')

      expect(node.props.value).toBe('Initial')

      // This is what Solid calls when a signal updates!
      rendererMethods.replaceText(node, 'Updated')

      expect(node.props.value).toBe('Updated')
      expect(node.type).toBe('TEXT')
    })
  })

  describe('setProperty', () => {
    it('should set regular props', () => {
      const node = rendererMethods.createElement('task')

      rendererMethods.setProperty(node, 'name', 'test-task')
      rendererMethods.setProperty(node, 'count', 42)

      expect(node.props.name).toBe('test-task')
      expect(node.props.count).toBe(42)
    })

    it('should handle key prop specially (Ralph Wiggum loop)', () => {
      const node = rendererMethods.createElement('task')

      rendererMethods.setProperty(node, 'key', 'unique-123')

      expect(node.key).toBe('unique-123')
      expect(node.props.key).toBeUndefined()
    })

    it('should ignore children prop', () => {
      const node = rendererMethods.createElement('task')

      rendererMethods.setProperty(node, 'children', 'should-be-ignored')

      expect(node.props.children).toBeUndefined()
    })
  })

  describe('insertNode', () => {
    it('should append child to parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, child)

      expect(parent.children).toHaveLength(1)
      expect(parent.children[0]).toBe(child)
      expect(child.parent).toBe(parent)
    })

    it('should insert child before anchor', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('task')
      const second = rendererMethods.createElement('task')
      const third = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, third)
      rendererMethods.insertNode(parent, second, third) // Insert second before third

      expect(parent.children).toHaveLength(3)
      expect(parent.children[0]).toBe(first)
      expect(parent.children[1]).toBe(second)
      expect(parent.children[2]).toBe(third)
    })
  })

  describe('removeNode', () => {
    it('should remove child from parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, child)
      expect(parent.children).toHaveLength(1)

      rendererMethods.removeNode(parent, child)

      expect(parent.children).toHaveLength(0)
      expect(child.parent).toBe(null)
    })
  })

  describe('isTextNode', () => {
    it('should identify TEXT nodes', () => {
      const textNode = rendererMethods.createTextNode('text')
      const elementNode = rendererMethods.createElement('task')

      expect(rendererMethods.isTextNode(textNode)).toBe(true)
      expect(rendererMethods.isTextNode(elementNode)).toBe(false)
    })
  })

  describe('getParentNode', () => {
    it('should return parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, child)

      expect(rendererMethods.getParentNode(child)).toBe(parent)
    })

    it('should return undefined for root nodes', () => {
      const node = rendererMethods.createElement('task')

      expect(rendererMethods.getParentNode(node)).toBeUndefined()
    })
  })

  describe('getFirstChild', () => {
    it('should return first child', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('task')
      const second = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)

      expect(rendererMethods.getFirstChild(parent)).toBe(first)
    })

    it('should return undefined for childless nodes', () => {
      const node = rendererMethods.createElement('task')

      expect(rendererMethods.getFirstChild(node)).toBeUndefined()
    })
  })

  describe('getNextSibling', () => {
    it('should return next sibling', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('task')
      const second = rendererMethods.createElement('task')
      const third = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)
      rendererMethods.insertNode(parent, third)

      expect(rendererMethods.getNextSibling(first)).toBe(second)
      expect(rendererMethods.getNextSibling(second)).toBe(third)
    })

    it('should return undefined for last child', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('task')

      rendererMethods.insertNode(parent, child)

      expect(rendererMethods.getNextSibling(child)).toBeUndefined()
    })
  })
})
