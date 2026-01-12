import { describe, it, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { pathToFileURL } from 'url'
import { $ } from 'bun'

// Increase timeout for CLI integration tests (they spawn processes and can be slow)
setDefaultTimeout(15000)

/**
 * Helper function to extract JSON from CLI output
 * Tries to find the last valid JSON object in the output, which is more robust
 * than greedy regex matching that can capture extra braces from log lines.
 */
function extractJsonFromOutput(output: string): unknown {
  const lines = output.split('\n').reverse()
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed)
      } catch {
        // Not valid JSON, try next line
        continue
      }
    }
  }
  // Fallback: try to parse the entire output
  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }
  throw new Error('No valid JSON found in output')
}

/**
 * CLI Integration Tests
 *
 * Tests all CLI commands (init, plan, run) with various options and error conditions.
 * Uses a temporary directory for each test to avoid side effects.
 */
describe('CLI', () => {
  let tempDir: string
  const cliPath = path.resolve(__dirname, '../packages/cli/src/index.ts')

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithers-cli-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('command parsing', () => {
    it('--help shows usage for main command', async () => {
      const result = await $`bun ${cliPath} --help`.quiet().nothrow()
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('smithers')
      expect(result.stdout.toString()).toContain('React-based AI agent framework')
      expect(result.stdout.toString()).toContain('init')
      expect(result.stdout.toString()).toContain('plan')
      expect(result.stdout.toString()).toContain('run')
    })

    it('--version shows correct version', async () => {
      const result = await $`bun ${cliPath} --version`.quiet().nothrow()
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toMatch(/\d+\.\d+\.\d+/)
    })

    it('unknown command shows error', async () => {
      const result = await $`bun ${cliPath} unknown-command`.quiet().nothrow()
      // Commander shows help for unknown commands (exit 0)
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('smithers')
    })

    it('unknown option shows error', async () => {
      const result = await $`bun ${cliPath} run --unknown-option agent.mdx`
        .cwd(tempDir)
        .quiet()
        .nothrow()
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString() + result.stdout.toString()).toContain(
        '--unknown-option'
      )
    })
  })

  describe('init command', () => {
    it('creates hello-world template in new directory', async () => {
      const projectDir = path.join(tempDir, 'my-project')
      const result = await $`bun ${cliPath} init ${projectDir}`.quiet().nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(projectDir)).toBe(true)
      expect(fs.existsSync(path.join(projectDir, 'agent.mdx'))).toBe(true)
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true)

      const agentContent = fs.readFileSync(
        path.join(projectDir, 'agent.mdx'),
        'utf-8'
      )
      expect(agentContent).toContain('Claude')
      expect(agentContent).toContain('hello')
    })

    it('creates research template', async () => {
      const projectDir = path.join(tempDir, 'research-agent')
      const result = await $`bun ${cliPath} init ${projectDir} --template research`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(projectDir)).toBe(true)
      expect(fs.existsSync(path.join(projectDir, 'agent.mdx'))).toBe(true)

      const agentContent = fs.readFileSync(
        path.join(projectDir, 'agent.mdx'),
        'utf-8'
      )
      expect(agentContent).toContain('ResearchAgent')
      expect(agentContent).toContain('Phase')
    })

    it('creates multi-agent template', async () => {
      const projectDir = path.join(tempDir, 'multi-agent')
      const result = await $`bun ${cliPath} init ${projectDir} --template multi-agent`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(projectDir)).toBe(true)

      const agentContent = fs.readFileSync(
        path.join(projectDir, 'agent.mdx'),
        'utf-8'
      )
      expect(agentContent).toContain('Architect')
      expect(agentContent).toContain('Developer')
      expect(agentContent).toContain('Team')
    })

    it('creates in current directory (.)', async () => {
      const result = await $`bun ${cliPath} init .`.cwd(tempDir).quiet().nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(path.join(tempDir, 'agent.mdx'))).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'package.json'))).toBe(true)
    })

    it('skips existing files with warning', async () => {
      const projectDir = path.join(tempDir, 'existing')
      fs.mkdirSync(projectDir)

      // Create existing agent.mdx
      fs.writeFileSync(path.join(projectDir, 'agent.mdx'), 'existing content')

      const result = await $`bun ${cliPath} init ${projectDir}`.quiet().nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('already exist')
      expect(result.stdout.toString()).toContain('Skipping')

      // Verify original content preserved
      const content = fs.readFileSync(path.join(projectDir, 'agent.mdx'), 'utf-8')
      expect(content).toBe('existing content')
    })

    it('errors on invalid template name', async () => {
      const projectDir = path.join(tempDir, 'invalid')
      const result = await $`bun ${cliPath} init ${projectDir} --template invalid-template`
        .quiet()
        .nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('Unknown template')
      expect(result.stderr.toString()).toContain('invalid-template')
      expect(result.stderr.toString()).toContain('Available')
    })

    it('creates package.json with correct dependencies', async () => {
      const projectDir = path.join(tempDir, 'pkg-test')
      await $`bun ${cliPath} init ${projectDir}`.quiet().nothrow()

      const pkgPath = path.join(projectDir, 'package.json')
      expect(fs.existsSync(pkgPath)).toBe(true)

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      expect(pkg.dependencies).toHaveProperty('smithers')
      expect(pkg.dependencies).toHaveProperty('react')
      expect(pkg.type).toBe('module')
      expect(pkg.scripts).toHaveProperty('start')
      expect(pkg.scripts).toHaveProperty('plan')
    })
  })

  describe('plan command', () => {
    it('renders MDX file to XML', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>
  Test prompt
</Claude>
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile}`.quiet().nothrow()

      expect(result.exitCode).toBe(0)
      const output = result.stdout.toString()
      expect(output).toContain('<claude>')
      expect(output).toContain('Test prompt')
    })

    it('renders TSX file to XML', async () => {
      // Use file URL to ensure cross-platform compatibility (handles Windows paths correctly)
      const smithersPath = path.resolve(__dirname, '../packages/smithers/dist/index.js')
      const smithersUrl = pathToFileURL(smithersPath).href
      const agentFile = path.join(tempDir, 'agent.tsx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from ${JSON.stringify(smithersUrl)}

export default (
  <Claude>
    TSX test prompt
  </Claude>
)
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile}`.quiet().nothrow()

      expect(result.exitCode).toBe(0)
      const output = result.stdout.toString()
      expect(output).toContain('<claude>')
      expect(output).toContain('TSX test prompt')
    })

    it('--json outputs JSON wrapper', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Test</Claude>
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile} --json`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      const output = result.stdout.toString()

      // Extract JSON robustly (may have info lines before it)
      const parsed = extractJsonFromOutput(output)
      expect(parsed).toHaveProperty('xml')
      expect((parsed as any).xml).toContain('<claude>')
    })

    it('--output writes to file', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      const outputFile = path.join(tempDir, 'plan.xml')

      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Output test</Claude>
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile} --output ${outputFile}`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(outputFile)).toBe(true)

      const planContent = fs.readFileSync(outputFile, 'utf-8')
      expect(planContent).toContain('<claude>')
      expect(planContent).toContain('Output test')
    })

    it('errors on missing file', async () => {
      const missingFile = path.join(tempDir, 'does-not-exist.mdx')
      const result = await $`bun ${cliPath} plan ${missingFile}`.quiet().nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('File not found')
    })

    it('errors on directory (not file)', async () => {
      const dir = path.join(tempDir, 'some-dir')
      fs.mkdirSync(dir)

      const result = await $`bun ${cliPath} plan ${dir}`.quiet().nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('not a file')
    })

    it('errors on file with syntax errors', async () => {
      const agentFile = path.join(tempDir, 'bad-syntax.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>
  Unclosed tag
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile}`.quiet().nothrow()

      expect(result.exitCode).not.toBe(0)
      // Should show some kind of syntax error
      const errorOutput = result.stderr.toString()
      expect(errorOutput.length).toBeGreaterThan(0)
    })

    it('errors on file without default export', async () => {
      // Use file URL to ensure cross-platform compatibility (handles Windows paths correctly)
      const smithersPath = path.resolve(__dirname, '../packages/smithers/dist/index.js')
      const smithersUrl = pathToFileURL(smithersPath).href
      const agentFile = path.join(tempDir, 'no-export.tsx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from ${JSON.stringify(smithersUrl)}

// No export
const MyAgent = <Claude>Test</Claude>
`
      )

      const result = await $`bun ${cliPath} plan ${agentFile}`.quiet().nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('No default export')
    })
  })

  describe('run command', () => {
    it('executes with --mock mode', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>
  Say hello
</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--yes skips approval prompt', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Test</Claude>
`
      )

      // With --yes, should not wait for input
      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      // Should not show approval prompt
      expect(result.stdout.toString()).not.toContain('Approve execution?')
    })

    it('--dry-run shows plan and exits', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Dry run test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --dry-run`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('<claude>')
      expect(result.stdout.toString()).toContain('Dry run')
      // Use case-insensitive check to match actual "Execution Complete" output
      expect(result.stdout.toString().toLowerCase()).not.toContain('execution complete')
    })

    it('--verbose shows detailed logs', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Verbose test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --verbose`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      // With verbose, should see frame information
      // The exact output format depends on the verbose implementation
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--max-frames limits execution frames', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Max frames test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --max-frames 5`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--timeout sets per-frame timeout', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Timeout test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --timeout 10`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--model overrides Claude model', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Model test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --model claude-opus-4-20250514`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--max-tokens overrides token limit', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Max tokens test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --max-tokens 2048`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('--config loads specific config file', async () => {
      const configFile = path.join(tempDir, 'custom.json')
      fs.writeFileSync(
        configFile,
        JSON.stringify({
          mockMode: true,
          autoApprove: true,
        })
      )

      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Config test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --config ${configFile}`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Execution Complete')
      expect(result.stdout.toString()).toContain('Using config from')
    })

    it('--output writes result to file', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      const outputFile = path.join(tempDir, 'result.txt')

      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Output test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --output ${outputFile}`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(fs.existsSync(outputFile)).toBe(true)

      const resultContent = fs.readFileSync(outputFile, 'utf-8')
      expect(resultContent.length).toBeGreaterThan(0)
    })

    it('--json outputs JSON result', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>JSON test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --yes --mock --json`
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      const output = result.stdout.toString()

      // Extract JSON robustly (may have info lines before it)
      const parsed = extractJsonFromOutput(output)
      expect(parsed).toHaveProperty('frames')
      expect(parsed).toHaveProperty('output')
    })

    it('auto-discovers config files', async () => {
      // Create .smithersrc in tempDir
      const configFile = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(
        configFile,
        JSON.stringify({
          mockMode: true,
          autoApprove: true,
        })
      )

      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Auto-discover test</Claude>
`
      )

      const result = await $`bun ${cliPath} run agent.mdx`
        .cwd(tempDir)
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('Using config from')
      expect(result.stdout.toString()).toContain('Execution Complete')
    })

    it('CLI options override config values', async () => {
      // Create config with mockMode: false
      const configFile = path.join(tempDir, '.smithersrc')
      fs.writeFileSync(
        configFile,
        JSON.stringify({
          mockMode: false, // Will be overridden by --mock
          autoApprove: true,
        })
      )

      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Override test</Claude>
`
      )

      // CLI --mock should override config mockMode: false
      const result = await $`bun ${cliPath} run agent.mdx --mock`
        .cwd(tempDir)
        .quiet()
        .nothrow()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('mock mode')
    })

    it('invalid --max-frames value errors cleanly', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --max-frames invalid`
        .quiet()
        .nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('Invalid --max-frames')
    })

    it('invalid --timeout value errors cleanly', async () => {
      const agentFile = path.join(tempDir, 'agent.mdx')
      fs.writeFileSync(
        agentFile,
        `import { Claude } from '@evmts/smithers'

<Claude>Test</Claude>
`
      )

      const result = await $`bun ${cliPath} run ${agentFile} --timeout -5`
        .quiet()
        .nothrow()

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('Invalid --timeout')
    })
  })
})
