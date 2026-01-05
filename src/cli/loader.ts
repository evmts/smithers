import type { ReactElement } from 'react'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import React from 'react'

// Import smithers components to make them available to MDX files
import {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
} from '../components/index.js'

// MDX components (only actual React components, not utilities/types)
const mdxComponents = {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
}

export interface LoadOptions {
  /**
   * Base URL for resolving imports in MDX files
   */
  baseUrl?: string
}

export interface LoadedModule {
  /**
   * The default export of the module (should be a React element or component)
   */
  default: unknown
  /**
   * Any other named exports
   */
  [key: string]: unknown
}

/**
 * Main entry point for loading agent files
 * Supports .tsx, .jsx, .ts, .js (via Bun import) and .mdx (via @mdx-js/mdx evaluate)
 */
export async function loadAgentFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<ReactElement> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }

  const ext = path.extname(absolutePath).toLowerCase()

  let module: LoadedModule

  if (ext === '.mdx') {
    module = await loadMdxFile(absolutePath, options)
  } else if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    module = await loadTsxFile(absolutePath)
  } else {
    throw new Error(
      `Unsupported file extension: ${ext}. ` +
        `Supported extensions: .mdx, .tsx, .jsx, .ts, .js`
    )
  }

  return extractElement(module)
}

/**
 * Load a TSX/JSX/TS/JS file using Bun's native import
 */
export async function loadTsxFile(filePath: string): Promise<LoadedModule> {
  try {
    // Convert file path to file URL for proper ESM import
    // This handles paths with spaces and ensures Node ESM compatibility
    const fileUrl = pathToFileURL(filePath).href
    const module = await import(fileUrl)
    return module
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load TSX file: ${filePath}\n` +
        `Reason: ${message}\n` +
        `Make sure the file has valid TypeScript/JSX syntax and exports a React element or component.`
    )
  }
}

/**
 * Load an MDX file using @mdx-js/mdx evaluate()
 */
export async function loadMdxFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<LoadedModule> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')

    // Evaluate the MDX content with React runtime and smithers components
    const module = await evaluate(content, {
      ...runtime,
      // Convert file path to file URL for proper baseUrl
      baseUrl: options.baseUrl || pathToFileURL(filePath).href,
      development: false,
      // Provide smithers components to MDX (only actual React components)
      useMDXComponents: () => mdxComponents,
    })

    return module as LoadedModule
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load MDX file: ${filePath}\n` +
        `Reason: ${message}\n` +
        `Make sure the file has valid MDX syntax.`
    )
  }
}

/**
 * Extract a React element from a loaded module
 * Handles both direct element exports and component exports
 */
export function extractElement(module: LoadedModule): ReactElement {
  const defaultExport = module.default

  if (defaultExport === null || defaultExport === undefined) {
    throw new Error(
      'No default export found in agent file.\n' +
        'Make sure your file exports a React element or component as the default export.\n' +
        'For MDX files, the content is automatically exported as the default.'
    )
  }

  // If it's already a React element, return it
  if (React.isValidElement(defaultExport)) {
    return defaultExport
  }

  // If it's a function (component), call it to get the element
  if (typeof defaultExport === 'function') {
    try {
      const element = React.createElement(defaultExport as React.ComponentType)
      return element
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to create element from component: ${message}\n` +
          `Make sure the default export is a valid React component.`
      )
    }
  }

  throw new Error(
    `Invalid default export type: ${typeof defaultExport}\n` +
      `Expected a React element or component, but got ${typeof defaultExport}.\n` +
      `Make sure your file exports a React element or component as the default export.`
  )
}
