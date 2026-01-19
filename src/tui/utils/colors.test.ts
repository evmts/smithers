import { describe, test, expect } from 'bun:test'
import { colors, getStatusColor, getSeverityColor } from './colors.js'

describe('tui/utils/colors', () => {
  describe('colors constant', () => {
    test('has Tokyo Night palette colors', () => {
      expect(colors.bg).toBe('#1a1b26')
      expect(colors.blue).toBe('#7aa2f7')
      expect(colors.green).toBe('#9ece6a')
      expect(colors.red).toBe('#f7768e')
    })
  })

  describe('getStatusColor', () => {
    test('returns green for running', () => {
      expect(getStatusColor('running')).toBe('#9ece6a')
    })

    test('returns teal for completed', () => {
      expect(getStatusColor('completed')).toBe('#73daca')
    })

    test('returns red for failed', () => {
      expect(getStatusColor('failed')).toBe('#f7768e')
    })

    test('returns orange for pending', () => {
      expect(getStatusColor('pending')).toBe('#e0af68')
    })

    test('returns comment color for unknown status', () => {
      expect(getStatusColor('unknown')).toBe('#565f89')
    })
  })

  describe('getSeverityColor', () => {
    test('returns orange for warning', () => {
      expect(getSeverityColor('warning')).toBe('#e0af68')
    })

    test('returns red for critical', () => {
      expect(getSeverityColor('critical')).toBe('#f7768e')
    })

    test('returns blue for info/default', () => {
      expect(getSeverityColor('info')).toBe('#7aa2f7')
    })
  })
})
