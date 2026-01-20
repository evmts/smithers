/**
 * Tests for arg-builder - Codex CLI argument construction
 */

import { describe, test, expect } from 'bun:test'
import { buildCodexArgs, codexModelMap } from './arg-builder.js'

describe('codexModelMap', () => {
  test('maps o3 to o3', () => {
    expect(codexModelMap.o3).toBe('o3')
  })

  test('maps o4 to o4-mini', () => {
    expect(codexModelMap.o4).toBe('o4-mini')
  })

  test('maps o4-mini to o4-mini', () => {
    expect(codexModelMap['o4-mini']).toBe('o4-mini')
  })

  test('maps gpt-4o to gpt-4o', () => {
    expect(codexModelMap['gpt-4o']).toBe('gpt-4o')
  })

  test('maps gpt-4 to gpt-4', () => {
    expect(codexModelMap['gpt-4']).toBe('gpt-4')
  })
})

describe('buildCodexArgs', () => {
  test('always includes exec subcommand first', () => {
    const args = buildCodexArgs({ prompt: 'test' })

    expect(args[0]).toBe('exec')
  })

  test('adds prompt as last argument', () => {
    const args = buildCodexArgs({ prompt: 'hello world' })

    expect(args[args.length - 1]).toBe('hello world')
  })

  describe('model handling', () => {
    test('maps shorthand model name', () => {
      const args = buildCodexArgs({ prompt: 'test', model: 'o3' })

      expect(args).toContain('--model')
      expect(args).toContain('o3')
    })

    test('passes through custom model name', () => {
      const args = buildCodexArgs({ prompt: 'test', model: 'custom-model' })

      expect(args).toContain('--model')
      expect(args).toContain('custom-model')
    })

    test('omits model flag when not specified', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--model')
    })
  })

  describe('sandbox mode handling', () => {
    test('adds sandbox flag for read-only', () => {
      const args = buildCodexArgs({ prompt: 'test', sandboxMode: 'read-only' })

      expect(args).toContain('--sandbox')
      expect(args).toContain('read-only')
    })

    test('adds sandbox flag for workspace-write', () => {
      const args = buildCodexArgs({ prompt: 'test', sandboxMode: 'workspace-write' })

      expect(args).toContain('--sandbox')
      expect(args).toContain('workspace-write')
    })

    test('adds sandbox flag for danger-full-access', () => {
      const args = buildCodexArgs({ prompt: 'test', sandboxMode: 'danger-full-access' })

      expect(args).toContain('--sandbox')
      expect(args).toContain('danger-full-access')
    })

    test('omits sandbox flag when not specified', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--sandbox')
    })
  })

  describe('approval policy handling', () => {
    test('adds approval flag for untrusted', () => {
      const args = buildCodexArgs({ prompt: 'test', approvalPolicy: 'untrusted' })

      expect(args).toContain('--ask-for-approval')
      expect(args).toContain('untrusted')
    })

    test('adds approval flag for on-failure', () => {
      const args = buildCodexArgs({ prompt: 'test', approvalPolicy: 'on-failure' })

      expect(args).toContain('--ask-for-approval')
      expect(args).toContain('on-failure')
    })

    test('adds approval flag for on-request', () => {
      const args = buildCodexArgs({ prompt: 'test', approvalPolicy: 'on-request' })

      expect(args).toContain('--ask-for-approval')
      expect(args).toContain('on-request')
    })

    test('adds approval flag for never', () => {
      const args = buildCodexArgs({ prompt: 'test', approvalPolicy: 'never' })

      expect(args).toContain('--ask-for-approval')
      expect(args).toContain('never')
    })

    test('omits approval flag when not specified', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--ask-for-approval')
    })
  })

  describe('full auto mode handling', () => {
    test('adds full-auto flag when true', () => {
      const args = buildCodexArgs({ prompt: 'test', fullAuto: true })

      expect(args).toContain('--full-auto')
    })

    test('omits full-auto flag when false', () => {
      const args = buildCodexArgs({ prompt: 'test', fullAuto: false })

      expect(args).not.toContain('--full-auto')
    })

    test('omits full-auto flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--full-auto')
    })
  })

  describe('bypass sandbox handling', () => {
    test('adds bypass flag when true', () => {
      const args = buildCodexArgs({ prompt: 'test', bypassSandbox: true })

      expect(args).toContain('--dangerously-bypass-approvals-and-sandbox')
    })

    test('omits bypass flag when false', () => {
      const args = buildCodexArgs({ prompt: 'test', bypassSandbox: false })

      expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    })

    test('omits bypass flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    })
  })

  describe('working directory handling', () => {
    test('adds cd flag when specified', () => {
      const args = buildCodexArgs({ prompt: 'test', cwd: '/path/to/project' })

      expect(args).toContain('--cd')
      expect(args).toContain('/path/to/project')
    })

    test('omits cd flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--cd')
    })
  })

  describe('skip git repo check handling', () => {
    test('adds skip-git-repo-check flag when true', () => {
      const args = buildCodexArgs({ prompt: 'test', skipGitRepoCheck: true })

      expect(args).toContain('--skip-git-repo-check')
    })

    test('omits skip-git-repo-check flag when false', () => {
      const args = buildCodexArgs({ prompt: 'test', skipGitRepoCheck: false })

      expect(args).not.toContain('--skip-git-repo-check')
    })

    test('omits skip-git-repo-check flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--skip-git-repo-check')
    })
  })

  describe('additional directories handling', () => {
    test('adds add-dir flags for each directory', () => {
      const args = buildCodexArgs({
        prompt: 'test',
        addDirs: ['/tmp/build', '/var/log']
      })

      const addDirCount = args.filter(a => a === '--add-dir').length
      expect(addDirCount).toBe(2)
      expect(args).toContain('/tmp/build')
      expect(args).toContain('/var/log')
    })

    test('omits add-dir when empty array', () => {
      const args = buildCodexArgs({ prompt: 'test', addDirs: [] })

      expect(args).not.toContain('--add-dir')
    })

    test('omits add-dir when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--add-dir')
    })
  })

  describe('output schema handling', () => {
    test('adds output-schema flag', () => {
      const args = buildCodexArgs({ prompt: 'test', outputSchema: '/path/to/schema.json' })

      expect(args).toContain('--output-schema')
      expect(args).toContain('/path/to/schema.json')
    })

    test('omits output-schema flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--output-schema')
    })
  })

  describe('json output handling', () => {
    test('adds json flag when true', () => {
      const args = buildCodexArgs({ prompt: 'test', json: true })

      expect(args).toContain('--json')
    })

    test('omits json flag when false', () => {
      const args = buildCodexArgs({ prompt: 'test', json: false })

      expect(args).not.toContain('--json')
    })

    test('omits json flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--json')
    })
  })

  describe('output last message handling', () => {
    test('adds output-last-message flag', () => {
      const args = buildCodexArgs({ prompt: 'test', outputLastMessage: '/tmp/output.txt' })

      expect(args).toContain('--output-last-message')
      expect(args).toContain('/tmp/output.txt')
    })

    test('omits output-last-message flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--output-last-message')
    })
  })

  describe('images handling', () => {
    test('adds image flags for each image', () => {
      const args = buildCodexArgs({
        prompt: 'test',
        images: ['./screenshot.png', './diagram.jpg']
      })

      const imageCount = args.filter(a => a === '--image').length
      expect(imageCount).toBe(2)
      expect(args).toContain('./screenshot.png')
      expect(args).toContain('./diagram.jpg')
    })

    test('omits image when empty array', () => {
      const args = buildCodexArgs({ prompt: 'test', images: [] })

      expect(args).not.toContain('--image')
    })

    test('omits image when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--image')
    })
  })

  describe('config overrides handling', () => {
    test('adds config flags for each override', () => {
      const args = buildCodexArgs({
        prompt: 'test',
        configOverrides: {
          model: 'o3',
          'sandbox_permissions': ['disk-full-read-access']
        }
      })

      const configCount = args.filter(a => a === '--config').length
      expect(configCount).toBe(2)
      expect(args).toContain('model="o3"')
      expect(args).toContain('sandbox_permissions=["disk-full-read-access"]')
    })

    test('omits config when empty object', () => {
      const args = buildCodexArgs({ prompt: 'test', configOverrides: {} })

      expect(args).not.toContain('--config')
    })

    test('omits config when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--config')
    })
  })

  describe('profile handling', () => {
    test('adds profile flag', () => {
      const args = buildCodexArgs({ prompt: 'test', profile: 'production' })

      expect(args).toContain('--profile')
      expect(args).toContain('production')
    })

    test('omits profile flag when undefined', () => {
      const args = buildCodexArgs({ prompt: 'test' })

      expect(args).not.toContain('--profile')
    })
  })

  describe('combined options', () => {
    test('builds correct args with multiple options', () => {
      const args = buildCodexArgs({
        prompt: 'implement feature',
        model: 'o4-mini',
        sandboxMode: 'workspace-write',
        approvalPolicy: 'on-request',
        cwd: '/project',
        addDirs: ['/tmp'],
        json: true,
        profile: 'dev'
      })

      expect(args[0]).toBe('exec')
      expect(args).toContain('--model')
      expect(args).toContain('o4-mini')
      expect(args).toContain('--sandbox')
      expect(args).toContain('workspace-write')
      expect(args).toContain('--ask-for-approval')
      expect(args).toContain('on-request')
      expect(args).toContain('--cd')
      expect(args).toContain('/project')
      expect(args).toContain('--add-dir')
      expect(args).toContain('/tmp')
      expect(args).toContain('--json')
      expect(args).toContain('--profile')
      expect(args).toContain('dev')
      expect(args[args.length - 1]).toBe('implement feature')
    })

    test('minimal options only includes exec and prompt', () => {
      const args = buildCodexArgs({ prompt: 'hello' })

      expect(args).toEqual(['exec', 'hello'])
    })
  })
})
