import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { createClaudeAssistant } from './claude-assistant.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('claude-assistant', () => {
  let db: SmithersDB
  let testDir: string

  beforeEach(() => {
    testDir = path.join('/tmp', `assistant-test-${Date.now()}`)
    fs.mkdirSync(testDir, { recursive: true })
    const dbPath = path.join(testDir, 'test.db')
    db = createSmithersDB(dbPath)
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('createClaudeAssistant', () => {
    test('returns assistant object with required methods', () => {
      const assistant = createClaudeAssistant(db)
      expect(typeof assistant.chat).toBe('function')
      expect(typeof assistant.isAvailable).toBe('function')
    })

    test('isAvailable returns false when no API key', () => {
      const originalKey = process.env['ANTHROPIC_API_KEY']
      delete process.env['ANTHROPIC_API_KEY']
      
      const assistant = createClaudeAssistant(db)
      expect(assistant.isAvailable()).toBe(false)
      
      if (originalKey) {
        process.env['ANTHROPIC_API_KEY'] = originalKey
      }
    })

    test('chat throws when API not available', async () => {
      const originalKey = process.env['ANTHROPIC_API_KEY']
      delete process.env['ANTHROPIC_API_KEY']
      
      const assistant = createClaudeAssistant(db)
      await expect(assistant.chat([
        { role: 'user', content: 'test', timestamp: new Date().toISOString() }
      ])).rejects.toThrow('Claude API not available')
      
      if (originalKey) {
        process.env['ANTHROPIC_API_KEY'] = originalKey
      }
    })
  })
})
