#!/usr/bin/env bun
import { Claude, executePlan, File, OutputFormat } from '../../src'
import { createStore } from 'solid-js/store'

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
}

const [store, setStore] = createStore<TestGeneratorState>({
  phase: 'analyze',
  sourceFile: '',
  analysis: null,
  testCode: '',
})

const actions = {
  setPhase: (phase: TestGeneratorState['phase']) => setStore('phase', phase),
  setAnalysis: (analysis: TestGeneratorState['analysis']) => setStore('analysis', analysis),
  setTestCode: (testCode: string) => setStore('testCode', testCode),
}

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

function TestGenerator(props: { sourceFile: string; framework: string }) {
  // Return closure for reactivity
  return () => {
    if (store.phase === 'analyze') {
      return (
        <Claude
          allowedTools={['Read']}
          onFinished={(result) => {
            // Parse the JSON response
            try {
              const parsed = JSON.parse(result.text)
              actions.setAnalysis(parsed)
              actions.setPhase('generate')
            } catch (err) {
              console.error('Failed to parse analysis:', err)
              actions.setPhase('done')
            }
          }}
        >
          <OutputFormat schema={analysisSchema}>
            Analyze the source file at: {props.sourceFile}

            Use the Read tool to load the file, then extract:
            1. All exported functions
            2. All exported classes
            3. All exports (both functions and classes)

            Return JSON matching the schema.
          </OutputFormat>
        </Claude>
      )
    }

    if (store.phase === 'generate') {
      if (!store.analysis) {
        console.error('No analysis available')
        actions.setPhase('done')
        return null
      }

      const frameworkInstructions = {
        bun: 'Use Bun test syntax with `import { test, expect } from "bun:test"`',
        jest: 'Use Jest syntax with `describe`, `it`, `expect`',
        vitest: 'Use Vitest syntax with `import { describe, it, expect } from "vitest"`',
      }[props.framework] || 'Use Bun test syntax with `import { test, expect } from "bun:test"`'

      return (
        <Claude
          allowedTools={['Read']}
          onFinished={(result) => {
            // Extract test code from result (Claude returns code in markdown blocks)
            const codeMatch = result.text.match(/```(?:typescript|ts)?\n([\s\S]*?)\n```/)
            const code = codeMatch ? codeMatch[1] : result.text

            actions.setTestCode(code)
            actions.setPhase('write')
          }}
        >
          Generate comprehensive tests for: {props.sourceFile}

          Analysis:
          - Functions: {store.analysis.functions.join(', ')}
          - Classes: {store.analysis.classes.join(', ')}

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

    if (store.phase === 'write') {
      const testFilePath = props.sourceFile.replace(/\.(tsx|jsx|ts|js)$/, (_, ext) => `.test.${ext}`)

      return (
        <File
          path={testFilePath}
          onWritten={() => {
            console.log(`✓ Test file written: ${testFilePath}`)
            actions.setPhase('done')
          }}
        >
          {store.testCode}
        </File>
      )
    }

    // Done
    return null
  }
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

const result = await executePlan(() => <TestGenerator sourceFile={sourceFile} framework={framework} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

const { analysis, testCode } = store

console.log()
console.log('✅ Test Generation Complete')

if (analysis) {
  console.log(`  Functions: ${analysis.functions.length}`)
  console.log(`  Classes: ${analysis.classes.length}`)
  console.log(`  Test cases: ~${(analysis.functions.length + analysis.classes.length) * 3}`)
}