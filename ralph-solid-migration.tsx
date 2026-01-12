import { Claude, Phase, Step } from '@evmts/smithers'

export default function SolidMigrationAgent() {
  return (
    <Claude>
      <Phase name="migrate">
        <Step>
          Read the migration plan at /Users/williamcory/.claude/plans/polymorphic-meandering-cherny.md

          This plan contains the complete specification for migrating Smithers from React to Solid.js.
          Read it carefully to understand:
          - The overall architecture (shared smithers-core + smithers-solid)
          - The 7 phases of migration
          - Which files need to be created/modified
          - The patterns for converting React to Solid.js
        </Step>

        <Step>
          Check what's been implemented so far.

          Use git status to see uncommitted changes.
          Look at the packages/smithers-core/ directory to see what exists.
          Look at the packages/smithers-solid/ directory to understand current state.
          Read recent commit history to understand what work has been done.

          Based on what you find, identify the next small, concrete task that needs to be done.
        </Step>

        <Step>
          Implement one small piece.

          Pick the next logical piece of work based on the plan and current state.
          This should be something concrete and completable:
          - Finish one file
          - Extract one module
          - Port one function
          - Fix one issue

          Don't try to do everything at once. Just make measurable progress on one thing.

          Implementation guidelines:
          - Follow the patterns in the migration plan
          - Remove React dependencies for core package
          - Use Solid.js primitives for solid package
          - Maintain backward compatibility where needed
          - Write clean, well-documented code
        </Step>

        <Step>
          Test your changes.

          Run any relevant tests to make sure your changes work:
          - If you modified smithers-core, run: cd packages/smithers-core && bun test
          - If you modified smithers-solid, run: cd packages/smithers-solid && bun test
          - Try building the package: bun run build

          Fix any errors before committing.
        </Step>

        <Step>
          Commit your changes with a descriptive message.

          Use git to stage and commit your work:
          - git add [files you changed]
          - Write a clear commit message describing what you did
          - Follow conventional commit format: "feat:", "fix:", "refactor:", etc.
          - Add "Co-Authored-By: Claude Sonnet 4.5 &lt;noreply@anthropic.com&gt;"

          The post-commit hook will automatically review your commit.
        </Step>

        <Step>
          After committing, check for review feedback.

          The Codex post-commit hook may have created a review file.
          Check the reviews/ directory for any feedback on your commit.

          If there's feedback:
          - Read it carefully
          - Address any issues mentioned
          - Make another commit fixing the issues

          If no review or LGTM:
          - Continue to the next piece of work
        </Step>
      </Phase>
    </Claude>
  )
}
