import { Claude, Phase, Step } from '@evmts/smithers'

export default function SolidTuiMigration() {
  return (
    <Claude>
      <Phase name="discovery">
        <Step>
          Explore the current TUI implementation.

          Find and analyze:
          1. The current React-based TUI code (look in examples/ or wherever the TUI lives)
          2. What UI framework is currently being used (React with Ink?)
          3. The component structure and key features
          4. Dependencies in package.json related to the TUI

          Use Read and Glob to find and examine the TUI code.
        </Step>

        <Step>
          Review the @evmts/smithers-solid package in packages/smithers-solid/.

          Read and understand:
          1. What's already implemented
          2. How it differs from the React version
          3. What's complete vs what's still TODO
          4. The API differences between React and Solid.js versions
        </Step>
      </Phase>

      <Phase name="planning">
        <Step>
          Create a detailed migration plan.

          Based on your discovery, create a plan for:

          1. Solid.js TUI Library Choice - Research if there's a Solid.js equivalent to Ink. Consider alternatives. Recommend the best approach.

          2. Component Migration Strategy - Map React components to Solid.js equivalents. Identify hooks that need conversion (useState to createSignal, useEffect to createEffect, etc.).

          3. Integration Points - How the TUI integrates with @evmts/smithers-solid. Where the TUI code should live. Build and dev workflow changes needed.

          Write this plan to SOLID_TUI_MIGRATION_PLAN.md
        </Step>
      </Phase>

      <Phase name="setup">
        <Step>
          Set up the Solid.js TUI package structure based on your plan.

          1. Create or identify where to put the Solid TUI
          2. Add necessary dependencies: solid-js, TUI library for Solid, build tools
          3. Set up tsconfig.json for Solid.js compilation
          4. Create basic package.json with scripts
        </Step>
      </Phase>

      <Phase name="core-components">
        <Step>
          Migrate core TUI components from React to Solid.js.

          Convert the main components:
          1. Root/App Component - Convert from React to Solid's render. Update imports from 'react' to 'solid-js'
          2. Layout Components - Box, Text, etc. Convert JSX to Solid JSX
          3. State Management - Convert useState to createSignal, useEffect to createEffect
          4. Interactive Components - Input handling, focus management, keyboard shortcuts

          Make the conversions file by file, testing as you go.
        </Step>
      </Phase>

      <Phase name="smithers-integration">
        <Step>
          Integrate with @evmts/smithers-solid.

          1. Import and use the Solid versions of Smithers components
          2. Set up the Ralph loop integration - Wire up executePlan, connect TUI display to execution events
          3. Create demo agents that work with the Solid TUI
        </Step>
      </Phase>

      <Phase name="testing">
        <Step>
          Test the Solid.js TUI.

          1. Basic Rendering - Verify components render correctly
          2. Interactivity - Test keyboard input, navigation
          3. Ralph Loop Integration - Run a simple agent, verify execution progress
          4. Performance - Compare to React version, check for memory leaks

          Document any issues found.
        </Step>
      </Phase>

      <Phase name="documentation">
        <Step>
          Update documentation.

          1. Update README files with Solid.js TUI documentation and migration guide
          2. Create Solid.js TUI examples
          3. Update CLAUDE.md with section on the Solid.js TUI
        </Step>
      </Phase>

      <Phase name="cleanup">
        <Step>
          Final cleanup and validation.

          1. Code Quality - Run linter, fix TypeScript errors
          2. Build - Ensure package builds successfully
          3. Git - Review all changes, suggest commit message

          Provide a summary of what was accomplished.
        </Step>
      </Phase>
    </Claude>
  )
}
