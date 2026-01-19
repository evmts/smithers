import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  git,
  getCommitHash,
  getCommitInfo,
  getDiffStats,
  getGitStatus,
  isGitRepo,
  getCurrentBranch,
  addGitNotes,
  getGitNotes,
  hasGitNotes,
} from './git.js'

describe('git utilities', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = path.join('/tmp', `git-test-${Date.now()}`)
    fs.mkdirSync(testDir, { recursive: true })
    await Bun.$`git init`.cwd(testDir).quiet()
    await Bun.$`git config user.email "test@test.com"`.cwd(testDir).quiet()
    await Bun.$`git config user.name "Test User"`.cwd(testDir).quiet()
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'hello')
    await Bun.$`git add .`.cwd(testDir).quiet()
    await Bun.$`git commit -m "Initial commit"`.cwd(testDir).quiet()
  })

  afterAll(async () => {
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('git()', () => {
    test('executes git command and returns stdout', async () => {
      const result = await git('status', '--porcelain', { cwd: testDir })
      expect(result.stdout).toBeDefined()
    })

    test('throws on invalid command', async () => {
      await expect(git('invalid-command-xyz')).rejects.toThrow()
    })
  })

  describe('getCommitHash()', () => {
    test('returns 40-char SHA for HEAD', async () => {
      const hash = await getCommitHash('HEAD', testDir)
      expect(hash).toMatch(/^[a-f0-9]{40}$/)
    })

    test('throws for non-existent ref', async () => {
      await expect(getCommitHash('nonexistent-ref', testDir)).rejects.toThrow()
    })
  })

  describe('getCommitInfo()', () => {
    test('returns commit info with hash, author, message', async () => {
      const info = await getCommitInfo('HEAD', testDir)
      expect(info.hash).toMatch(/^[a-f0-9]{40}$/)
      expect(typeof info.author).toBe('string')
      expect(info.author.length).toBeGreaterThan(0)
      expect(typeof info.message).toBe('string')
      expect(info.message.length).toBeGreaterThan(0)
    })
  })

  describe('getDiffStats()', () => {
    test('returns diff stats with files array', async () => {
      fs.writeFileSync(path.join(testDir, 'new.txt'), 'new content')
      await Bun.$`git add .`.cwd(testDir).quiet()
      await Bun.$`git commit -m "Add new file"`.cwd(testDir).quiet()
      const stats = await getDiffStats(undefined, testDir)
      expect(stats.files).toBeInstanceOf(Array)
      expect(typeof stats.insertions).toBe('number')
      expect(typeof stats.deletions).toBe('number')
    })
  })

  describe('getGitStatus()', () => {
    test('returns VCSStatus with staged, modified, untracked', async () => {
      fs.writeFileSync(path.join(testDir, 'untracked.txt'), 'untracked')
      const status = await getGitStatus(testDir)
      expect(status.untracked).toContain('untracked.txt')
      fs.unlinkSync(path.join(testDir, 'untracked.txt'))
    })
  })

  describe('isGitRepo()', () => {
    test('returns true inside git repo', async () => {
      expect(await isGitRepo(testDir)).toBe(true)
    })

    test('returns false outside git repo', async () => {
      const tmpDir = path.join('/tmp', `non-git-${Date.now()}`)
      fs.mkdirSync(tmpDir, { recursive: true })
      const result = await isGitRepo(tmpDir)
      fs.rmSync(tmpDir, { recursive: true, force: true })
      expect(result).toBe(false)
    })
  })

  describe('getCurrentBranch()', () => {
    test('returns branch name', async () => {
      const branch = await getCurrentBranch(testDir)
      expect(branch).toBeDefined()
      expect(typeof branch).toBe('string')
    })
  })

  describe('git notes', () => {
    test('addGitNotes and getGitNotes round-trip', async () => {
      await addGitNotes('test note content', 'HEAD', false, testDir)
      const notes = await getGitNotes('HEAD', testDir)
      expect(notes).toContain('test note content')
    })

    test('hasGitNotes returns true when notes exist', async () => {
      const has = await hasGitNotes('HEAD', testDir)
      expect(has).toBe(true)
    })

    test('getGitNotes returns null for commit without notes', async () => {
      fs.writeFileSync(path.join(testDir, 'another.txt'), 'content')
      await Bun.$`git add .`.cwd(testDir).quiet()
      await Bun.$`git commit -m "Another commit"`.cwd(testDir).quiet()
      const notes = await getGitNotes('HEAD', testDir)
      expect(notes).toBe(null)
    })
  })
})
