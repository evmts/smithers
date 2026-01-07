#!/usr/bin/env bun
import { Claude, executePlan, File } from '../../src'
import { create } from 'zustand'

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
  setPhase: (phase: ProcessorState['phase']) => void
  setFiles: (files: string[]) => void
  setProcessedContent: (content: Record<string, string>) => void
  incrementWritten: () => void
}

const useStore = create<ProcessorState>((set) => ({
  phase: 'reading',
  files: [],
  processedContent: {},
  writtenCount: 0,
  setPhase: (phase) => set({ phase }),
  setFiles: (files) => set({ files }),
  setProcessedContent: (content) => set({ processedContent: content }),
  incrementWritten: () => set((state) => ({ writtenCount: state.writtenCount + 1 })),
}))

function FileProcessor({ pattern, outputDir }: { pattern: string; outputDir: string }) {
  const { phase, files, processedContent, writtenCount, setPhase, setFiles, setProcessedContent, incrementWritten } = useStore()

  if (phase === 'reading') {
    return (
      <Claude
        allowedTools={['Glob', 'Read']}
        onFinished={(result) => {
          // Extract file list from result
          const fileList = result.text.match(/\S+\.md/g) || []
          setFiles(fileList)
          setPhase('processing')
        }}
      >
        Find all markdown files matching pattern: {pattern}

        Use Glob to find files, then list them one per line.
      </Claude>
    )
  }

  if (phase === 'processing') {
    return (
      <Claude
        allowedTools={['Read']}
        onFinished={(result) => {
          // Parse the processed content from the result
          const processed: Record<string, string> = {}

          // Extract file content pairs from result
          files.forEach(file => {
            // Mock processing for demo - in real usage Claude would return structured data
            processed[file] = `Processed: ${file}`
          })

          setProcessedContent(processed)
          setPhase('writing')
        }}
      >
        Read and process the following markdown files:
        {files.map(f => `\n- ${f}`).join('')}

        For each file:
        1. Read the content
        2. Convert all headers to title case
        3. Add a table of contents at the top
        4. Add word count at the bottom

        Return the processed content for each file.
      </Claude>
    )
  }

  if (phase === 'writing') {
    return (
      <>
        {Object.entries(processedContent).map(([filename, content]) => {
          const outputPath = `${outputDir}/${filename.split('/').pop()}`
          return (
            <File
              key={filename}
              path={outputPath}
              onWritten={() => {
                console.log(`✓ Written: ${outputPath}`)
                incrementWritten()

                // Check if this is the last file
                const currentWritten = useStore.getState().writtenCount
                const totalFiles = files.length
                if (currentWritten === totalFiles) {
                  setPhase('done')
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

// Main execution
const pattern = process.argv[2] || '**/*.md'
const outputDir = process.argv[3] || './processed'

console.log('🔄 File Processor Starting')
console.log(`  Pattern: ${pattern}`)
console.log(`  Output: ${outputDir}`)
console.log()

const result = await executePlan(<FileProcessor pattern={pattern} outputDir={outputDir} />, {
  mockMode: process.env.SMITHERS_MOCK === 'true',
})

console.log()
console.log('✅ File Processing Complete')
console.log(`  Processed: ${useStore.getState().files.length} files`)
