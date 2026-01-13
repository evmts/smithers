#!/usr/bin/env bun
import { Claude, executePlan, File } from '../../src'
import { createStore } from 'solid-js/store'

/**
 * File Processor Example
 *
 * Demonstrates:
 * - Reading and processing multiple files
 * - File component for writing output
 * - State management for tracking progress
 * - Error handling for file operations
 */

interface ProcessorState {
  phase: 'reading' | 'processing' | 'writing' | 'done'
  files: string[]
  processedContent: Record<string, string>
  writtenCount: number
}

const [store, setStore] = createStore<ProcessorState>({
  phase: 'reading',
  files: [],
  processedContent: {},
  writtenCount: 0,
})

const actions = {
  setPhase: (phase: ProcessorState['phase']) => setStore('phase', phase),
  setFiles: (files: string[]) => setStore('files', files),
  setProcessedContent: (content: Record<string, string>) => setStore('processedContent', content),
  incrementWritten: () => setStore('writtenCount', (c) => c + 1),
}

function FileProcessor(props: { pattern: string; outputDir: string }) {
  // Return closure for reactivity
  return () => {
    if (store.phase === 'reading') {
      return (
        <Claude
          allowedTools={['Glob', 'Read']}
          onFinished={(result) => {
            // Extract file list from result
            const fileList = result.text.match(/\S+\.md/g) || []
            actions.setFiles(fileList)
            actions.setPhase('processing')
          }}
        >
          Find all markdown files matching pattern: {props.pattern}

          Use Glob to find files, then list them one per line.
        </Claude>
      )
    }

    if (store.phase === 'processing') {
      return (
        <Claude
          allowedTools={['Read']}
          onFinished={(result) => {
            // Parse the processed content from the result
            const processed: Record<string, string> = {}

            // Extract file content pairs from result
            store.files.forEach(file => {
              // Mock processing for demo - in real usage Claude would return structured data
              processed[file] = `Processed: ${file}`
            })

            actions.setProcessedContent(processed)
            actions.setPhase('writing')
          }}
        >
          Read and process the following markdown files:
          {store.files.map(f => `\n- ${f}`).join('')}

          For each file:
          1. Read the content
          2. Convert all headers to title case
          3. Add a table of contents at the top
          4. Add word count at the bottom

          Return the processed content for each file.
        </Claude>
      )
    }

    if (store.phase === 'writing') {
      return (
        <>
          {Object.entries(store.processedContent).map(([filename, content]) => {
            const outputPath = `${props.outputDir}/${filename.split('/').pop()}`
            return (
              <File
                key={filename}
                path={outputPath}
                onWritten={() => {
                  console.log(`✓ Written: ${outputPath}`)
                  actions.incrementWritten()

                  // Check if this is the last file
                  const currentWritten = store.writtenCount
                  const totalFiles = store.files.length
                  if (currentWritten === totalFiles) {
                    actions.setPhase('done')
                  }
                }}
              >
                {content}
              </File>
            )
          })}
        </>
      )
    }

    // Done phase - return null to complete execution
    return null
  }
}

// Main execution
const pattern = process.argv[2] || '**/*.md'
const outputDir = process.argv[3] || './processed'

console.log('🔄 File Processor Starting')
console.log(`  Pattern: ${pattern}`)
console.log(`  Output: ${outputDir}`)
console.log()

const result = await executePlan(() => <FileProcessor pattern={pattern} outputDir={outputDir} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

console.log()
console.log('✅ File Processing Complete')
console.log(`  Processed: ${store.files.length} files`)