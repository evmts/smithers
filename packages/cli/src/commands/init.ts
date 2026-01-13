import { Command } from 'commander'
import pc from 'picocolors'
import * as fs from 'fs'
import * as path from 'path'

import { displayError, info, success, warn } from '../display.js'

export const initCommand = new Command('init')
  .description('Initialize a new Smithers project')
  .argument('[dir]', 'Directory to initialize', '.')
  .option('--template <name>', 'Use a starter template', 'hello-world')
  .action(async (dir: string, options) => {
    try {
      await init(dir, options)
    } catch (error) {
      displayError(error as Error)
      process.exit(1)
    }
  })

interface InitOptions {
  template: string
}

const TEMPLATES: Record<string, { files: Record<string, string>; description: string }> = {
  'hello-world': {
    description: 'Simple hello world agent',
    files: {
      'agent.mdx': `import { Claude } from '@evmts/smithers'

# Hello World Agent

<Claude>
  You are a friendly assistant. Say hello and introduce yourself in one sentence.
</Claude>
`,
    },
  },
  research: {
    description: 'Multi-phase research agent',
    files: {
      'agent.mdx': `import { createSignal } from 'solid-js'
import { Claude, Phase, Step } from '@evmts/smithers'

# Research Agent

export function ResearchAgent(props) {
  const [phase, setPhase] = createSignal('gather')
  const [findings, setFindings] = createSignal(null)

  return () => {
    const p = phase()
    const f = findings()

    if (p === 'gather') {
      return (
        <Claude onFinished={(result) => {
          setFindings(result)
          setPhase('synthesize')
        }}>
          <Phase name="gather">
            <Step>Search for information about: {props.topic}</Step>
            <Step>Collect key findings</Step>
          </Phase>
        </Claude>
      )
    }

    return (
      <Claude>
        <Phase name="synthesize">
          Write a summary based on these findings:
          {JSON.stringify(f)}
        </Phase>
      </Claude>
    )
  }
}

<ResearchAgent topic="AI agents" />
`,
    },
  },
  'multi-agent': {
    description: 'Multi-agent orchestration example',
    files: {
      'agent.mdx': `import { createSignal } from 'solid-js'
import { Claude, Subagent, Phase, Persona } from '@evmts/smithers'

# Multi-Agent Team

export function Architect(props) {
  return (
    <Claude onFinished={props.onPlan}>
      <Persona role="software architect" />
      <Phase name="plan">
        Break down the task into subtasks.
        Return a JSON array of { name, description } objects.
      </Phase>
    </Claude>
  )
}

export function Developer(props) {
  return (
    <Claude onFinished={props.onComplete}>
      <Persona role="developer" />
      <Phase name="implement">
        Implement: {props.task.name}
        {props.task.description}
      </Phase>
    </Claude>
  )
}

export function Team(props) {
  const [stage, setStage] = createSignal('planning')
  const [plan, setPlan] = createSignal(null)
  const [done, setDone] = createSignal([])

  return () => {
    const s = stage()
    const p = plan()
    const d = done()

    if (s === 'planning') {
      return (
        <Architect onPlan={(res) => {
          setPlan(res)
          setStage('implementing')
        }} />
      )
    }

    const remaining = p?.tasks?.filter(t => !d.includes(t.name)) || []

    if (remaining.length === 0) {
      return null // Done!
    }

    return (
      <Developer
        task={remaining[0]}
        onComplete={() => setDone([...d, remaining[0].name])}
      />
    )
  }
}

<Team task="Build a simple REST API" />
`,
    },
  },
}

async function init(dir: string, options: InitOptions): Promise<void> {
  const targetDir = path.resolve(process.cwd(), dir)

  // Validate template
  const template = TEMPLATES[options.template]
  if (!template) {
    const available = Object.keys(TEMPLATES).join(', ')
    throw new Error(
      `Unknown template: ${options.template}. Available: ${available}`
    )
  }

  info(`Initializing Smithers project with ${pc.cyan(options.template)} template`)

  // Create directory if needed
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
    info(`Created directory: ${pc.cyan(dir)}`)
  }

  // Check for existing files
  const existingFiles = Object.keys(template.files).filter((file) =>
    fs.existsSync(path.join(targetDir, file))
  )

  if (existingFiles.length > 0) {
    warn(`Some files already exist: ${existingFiles.join(', ')}`)
    warn('Skipping existing files')
  }

  // Write template files
  for (const [file, content] of Object.entries(template.files)) {
    const filePath = path.join(targetDir, file)

    if (fs.existsSync(filePath)) {
      continue // Skip existing
    }

    fs.writeFileSync(filePath, content)
    success(`Created ${pc.cyan(file)}`)
  }

  // Create package.json if it doesn't exist
  const pkgPath = path.join(targetDir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    const pkg = {
      name: path.basename(targetDir),
      version: '0.1.0',
      type: 'module',
      scripts: {
        start: 'smithers run agent.mdx',
        plan: 'smithers plan agent.mdx',
      },
      dependencies: {
        '@evmts/smithers': '^0.1.0',
        'solid-js': '^1.9.0',
      },
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    success(`Created ${pc.cyan('package.json')}`)
  }

  // Create tsconfig.json if it doesn't exist
  const tsconfigPath = path.join(targetDir, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) {
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        jsx: 'preserve',
        jsxImportSource: '@evmts/smithers',
      },
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
    success(`Created ${pc.cyan('tsconfig.json')}`)
  }

  console.log()
  success('Project initialized!')
  console.log()
  console.log('Next steps:')
  console.log(pc.dim('  1.'), `cd ${dir === '.' ? '.' : dir}`)
  console.log(pc.dim('  2.'), 'bun install')
  console.log(pc.dim('  3.'), 'bun run start')
  console.log()
}