/**
 * Smithers - Build AI agents with React
 *
 * Main entry point exports core functionality + components.
 * Use submodule imports for more granular control:
 * - smithers/core - Execution engine only
 * - smithers/react - React renderer
 * - smithers/components - JSX components
 */

// Re-export everything from core
export * from './core/index.js'

// Re-export React renderer
export * from './react/index.js'

// Re-export components
export * from './components/index.js'

// Re-export debug utilities
export * from './debug/index.js'
