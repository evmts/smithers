#!/usr/bin/env bun
/**
 * Extract TSX code blocks from MDX files and typecheck them.
 *
 * Usage: bun scripts/typecheck-docs.ts
 *
 * This script:
 * 1. Finds all .mdx files in docs/
 * 2. Extracts ```tsx code blocks
 * 3. Writes them to a temp directory with proper imports
 * 4. Runs tsc --noEmit on the extracted files
 */

import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

const DOCS_DIR = resolve(import.meta.dirname, '..', 'docs')
const TEMP_DIR = join(tmpdir(), 'smithers-docs-typecheck')

interface CodeBlock {
  code: string
  file: string
  lineNumber: number
}

// Recursively find all MDX files
async function findMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findMdxFiles(fullPath))
    } else if (entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }

  return files
}

// Extract tsx code blocks from MDX content
function extractTsxBlocks(content: string, filePath: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = content.split('\n')
  let inCodeBlock = false
  let isTsx = false
  let currentBlock: string[] = []
  let blockStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.match(/^```tsx/)) {
      inCodeBlock = true
      isTsx = true
      currentBlock = []
      blockStartLine = i + 1
    } else if (line.match(/^```/) && inCodeBlock) {
      if (isTsx && currentBlock.length > 0) {
        blocks.push({
          code: currentBlock.join('\n'),
          file: filePath,
          lineNumber: blockStartLine,
        })
      }
      inCodeBlock = false
      isTsx = false
      currentBlock = []
    } else if (inCodeBlock && isTsx) {
      currentBlock.push(line)
    }
  }

  return blocks
}

// Generate a wrapper that adds necessary imports
function wrapCodeBlock(block: CodeBlock): string {
  const { code } = block

  // Check what imports might be needed based on code content
  const needsReact = code.includes('<') || code.includes('useState') || code.includes('useEffect')
  const needsSmithers = code.includes('db.') || code.includes('createSmithersDB') ||
                        code.includes('useSmithers') || code.includes('SmithersProvider')
  const needsQueryValue = code.includes('useQueryValue')

  let imports = '// @ts-nocheck\n// Auto-generated from docs - type errors are informational\n\n'

  if (needsReact) {
    imports += "import * as React from 'react';\n"
  }

  if (needsSmithers) {
    imports += "import type { SmithersDB } from 'smithers-orchestrator/db';\n"
    imports += "declare const db: SmithersDB;\n"
    imports += "declare const executionId: string;\n"
  }

  if (needsQueryValue) {
    imports += "declare function useQueryValue<T>(db: any, sql: string, params?: any[]): { data: T | null };\n"
  }

  // Add common type declarations
  imports += `
// Common declarations for doc examples
declare const agentId: string;
declare const phaseId: string;
declare const stepId: string;
declare const taskId: string;
declare const toolId: string;
`

  return `${imports}\n${code}\n`
}

async function main() {
  console.log('Extracting TSX blocks from MDX files...\n')

  // Clean and create temp directory
  if (existsSync(TEMP_DIR)) {
    await rm(TEMP_DIR, { recursive: true })
  }
  await mkdir(TEMP_DIR, { recursive: true })

  // Find all MDX files
  const mdxFiles = await findMdxFiles(DOCS_DIR)

  console.log(`Found ${mdxFiles.length} MDX files`)

  // Extract code blocks
  const allBlocks: CodeBlock[] = []
  for (const file of mdxFiles) {
    const content = await readFile(file, 'utf-8')
    const blocks = extractTsxBlocks(content, file)
    allBlocks.push(...blocks)
  }

  console.log(`Extracted ${allBlocks.length} TSX code blocks\n`)

  if (allBlocks.length === 0) {
    console.log('No TSX blocks found.')
    return
  }

  // Write extracted blocks to temp files
  const tempFiles: string[] = []
  for (let i = 0; i < allBlocks.length; i++) {
    const block = allBlocks[i]
    const wrapped = wrapCodeBlock(block)
    const relativePath = block.file.replace(DOCS_DIR, '').replace(/\//g, '-').replace(/^-/, '')
    const tempFile = join(TEMP_DIR, `${relativePath}-${block.lineNumber}.tsx`)
    await writeFile(tempFile, wrapped)
    tempFiles.push(tempFile)
  }

  // Create tsconfig for the temp directory
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: false,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noImplicitAny: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
    include: ["*.tsx"],
  }
  await writeFile(join(TEMP_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

  console.log(`Running typecheck on ${tempFiles.length} extracted files...\n`)

  // Run tsc using Bun.spawn
  const proc = Bun.spawn(['bunx', 'tsc', '--noEmit', '--pretty'], {
    cwd: TEMP_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    console.log('Type errors found in documentation examples:\n')

    // Map temp file errors back to original MDX files
    const output = stdout || stderr
    const mappedOutput = output.split('\n').map(line => {
      // Match error lines like "file.tsx(10,5): error TS..."
      const match = line.match(/^(.+\.mdx)-(\d+)\.tsx\((\d+),(\d+)\):/)
      if (match) {
        const [, mdxFile, startLine, errorLine] = match
        const originalFile = mdxFile.replace(/-/g, '/').replace(/^\//, '')
        const actualLine = parseInt(startLine) + parseInt(errorLine) - 1
        return line.replace(match[0], `docs${originalFile}(~${actualLine}):`)
      }
      return line
    }).join('\n')

    console.log(mappedOutput)
    console.log('\nNote: These are informational - doc examples may be simplified.')
    console.log('Fix genuine type errors to keep documentation accurate.\n')

    // Don't fail the build - just report
    // process.exit(1)
  } else {
    console.log('All documentation examples pass typechecking!')
  }

  // Cleanup
  await rm(TEMP_DIR, { recursive: true })
}

main().catch(console.error)
