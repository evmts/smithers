/**
 * Smithers - Build AI agents with Solid.js
 *
 * Main entry point exports core functionality + components.
 * Use submodule imports for more granular control:
 * - smithers/core - Execution engine only
 * - smithers/solid - Solid.js renderer
 * - smithers/components - JSX components
 */

// Re-export everything from core
export * from './core/index.js'

// Re-export Solid renderer
export * from './solid/index.js'

// Re-export components
export * from './components/index.js'

// Re-export debug utilities
export * from './debug/index.js'
