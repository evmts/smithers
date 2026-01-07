#!/usr/bin/env bun
import { Claude, executePlan, File, OutputFormat } from '../../src'
import { create } from 'zustand'

/**
 * Test Generator Example
 *
 * Demonstrates:
 * - Code analysis and understanding
 * - Structured output with OutputFormat
 * - Test file generation
 * - Integration with testing frameworks
 */

interface TestGeneratorState {
  phase: 'analyze' | 'generate' | 'write' | 'done'
  sourceFile: string
  analysis: {
    functions: string[]
    classes: string[]
    exports: string[]
  } | null
  testCode: string
  setPhase: (phase: TestGeneratorState['phase']) => void
  setAnalysis: (analysis: TestGeneratorState['analysis']) => void
  setTestCode: (code: string) => void
}

const useStore = create<TestGeneratorState>((set) => ({
  phase: 'analyze',
  sourceFile: '',
  analysis: null,
  testCode: '',
  setPhase: (phase) => set({ phase }),
  setAnalysis: (analysis) => set({ analysis }),
  setTestCode: (testCode) => set({ testCode }),
}))

const analysisSchema = {
  type: 'object',
  properties: {
    functions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exported function names',
    },
    classes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exported class names',
    },
    exports: {
      type: 'array',
      items: { type: 'string' },
      description: 'All exported names',
    },
  },
  required: ['functions', 'classes', 'exports'],
}

function TestGenerator({ sourceFile, framework }: { sourceFile: string; framework: string }) {
  const { phase, analysis, testCode, setPhase, setAnalysis, setTestCode } = useStore()

  if (phase === 'analyze') {
    return (
      <Claude
        allowedTools={['Read']}
        onFinished={(result) => {
          // Parse the JSON response
          try {
            const parsed = JSON.parse(result.text)
            setAnalysis(parsed)
            setPhase('generate')
          } catch (err) {
            console.error('Failed to parse analysis:', err)
            setPhase('done')
          }
        }}
      >
        <OutputFormat schema={analysisSchema}>
          Analyze the source file at: {sourceFile}

          Use the Read tool to load the file, then extract:
          1. All exported functions
          2. All exported classes
          3. All exports (both functions and classes)

          Return JSON matching the schema.
        </OutputFormat>
      </Claude>
    )
  }

  if (phase === 'generate') {
    if (!analysis) {
      console.error('No analysis available')
      setPhase('done')
      return null
    }

    const frameworkInstructions = {
      bun: 'Use Bun test syntax with `import { test, expect } from "bun:test"`',
      jest: 'Use Jest syntax with `describe`, `it`, `expect`',
      vitest: 'Use Vitest syntax with `import { describe, it, expect } from "vitest"`',
    }[framework] || 'Use Bun test syntax with `import { test, expect } from "bun:test"`'

    return (
      <Claude
        allowedTools={['Read']}
        onFinished={(result) => {
          // Extract test code from result (Claude returns code in markdown blocks)
          const codeMatch = result.text.match(/```(?:typescript|ts)?\n([\s\S]*?)\n```/)
          const code = codeMatch ? codeMatch[1] : result.text

          setTestCode(code)
          setPhase('write')
        }}
      >
        Generate comprehensive tests for: {sourceFile}

        Analysis:
        - Functions: {analysis.functions.join(', ')}
        - Classes: {analysis.classes.join(', ')}

        Requirements:
        1. {frameworkInstructions}
        2. Import the source file correctly
        3. Test all exported functions and classes
        4. Include:
           - Happy path tests
           - Edge cases
           - Error cases
           - Type safety tests (if applicable)
        5. Use descriptive test names
        6. Add helpful comments

        Read the source file to understand implementation details.

        Return the complete test file code in a TypeScript code block.
      </Claude>
    )
  }

  if (phase === 'write') {
    const testFilePath = sourceFile.replace(/\.(tsx|jsx|ts|js)$/, (_, ext) => `.test.${ext}`)

    return (
      <File
        path={testFilePath}
        onWritten={() => {
          console.log(`✓ Test file written: ${testFilePath}`)
          setPhase('done')
        }}
      >
        {testCode}
      </File>
    )
  }

  // Done
  return null
}

// Main execution
const sourceFile = process.argv[2]
const framework = process.argv[3] || 'bun'

if (!sourceFile) {
  console.error('❌ Usage: bun run agent.tsx <source-file> [framework]')
  console.error('   Frameworks: bun (default), jest, vitest')
  process.exit(1)
}

const validFrameworks = ['bun', 'jest', 'vitest']
if (!validFrameworks.includes(framework)) {
  console.error(`❌ Invalid framework: ${framework}`)
  console.error(`   Valid frameworks: ${validFrameworks.join(', ')}`)
  process.exit(1)
}

console.log('🧪 Test Generator Starting')
console.log(`  Source: ${sourceFile}`)
console.log(`  Framework: ${framework}`)
console.log()

const result = await executePlan(<TestGenerator sourceFile={sourceFile} framework={framework} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

const { analysis, testCode } = useStore.getState()

console.log()
console.log('✅ Test Generation Complete')

if (analysis) {
  console.log(`  Functions: ${analysis.functions.length}`)
  console.log(`  Classes: ${analysis.classes.length}`)
  console.log(`  Test cases: ~${(analysis.functions.length + analysis.classes.length) * 3}`)
}
