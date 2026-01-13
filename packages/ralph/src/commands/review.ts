import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { displaySuccess, displayError, displayInfo } from '../utils/display.js'
import { findGitRoot, getCommitDiff, getCommitMessage, getCommitShortHash } from '../utils/git.js'
import { checkCodexAvailable, displayCodexInstallGuide } from '../codex/availability.js'
import { runCodexReview, isLGTM, formatReview } from '../codex/integration.js'

export const reviewCommand = new Command('review')
  .description('Manually trigger Codex review of a commit')
  .argument('[commit]', 'Commit to review', 'HEAD')
  .option('--commit', 'Auto-commit the review')
  .option('--skip-codex', 'Skip Codex (for testing)')
  .action(async (commit: string, options) => {
    try {
      await review(commit, options)
    } catch (error) {
      displayError((error as Error).message)
      process.exit(1)
    }
  })

interface ReviewOptions {
  commit?: boolean
  skipCodex?: boolean
}

async function review(commit: string, options: ReviewOptions): Promise<void> {
  const repoRoot = findGitRoot(process.cwd())

  if (!repoRoot) {
    throw new Error('Not in a git repository')
  }

  // Check Codex availability
  const codexAvailable = await checkCodexAvailable()

  if (!codexAvailable && !options.skipCodex) {
    displayCodexInstallGuide()
    return
  }

  if (options.skipCodex) {
    displayInfo('Skipping Codex review (--skip-codex)')
    return
  }

  // Get commit details
  const diff = getCommitDiff(commit)
  const message = getCommitMessage(commit)
  const shortHash = getCommitShortHash(commit)

  // Run review
  const spinner = ora(`Reviewing commit ${shortHash}...`).start()

  let reviewText: string
  try {
    reviewText = await runCodexReview(diff, message)
    spinner.succeed(`Review complete for ${shortHash}`)
  } catch (error) {
    spinner.fail('Review failed')
    throw error
  }

  // Check if substantive
  if (isLGTM(reviewText)) {
    displayInfo('Review: LGTM - no issues found')
    return
  }

  // Save review
  const reviewsDir = path.join(repoRoot, 'reviews')
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir, { recursive: true })
  }

  const reviewPath = path.join(reviewsDir, `${shortHash}.md`)
  const formattedReview = formatReview(reviewText, commit, message)

  fs.writeFileSync(reviewPath, formattedReview)
  displaySuccess(`Review saved to ${path.relative(repoRoot, reviewPath)}`)

  // Display review
  console.log()
  console.log(pc.bold('Review:'))
  console.log(pc.dim('='.repeat(60)))
  console.log(reviewText)
  console.log(pc.dim('='.repeat(60)))
  console.log()

  // Auto-commit if enabled
  if (options.commit) {
    try {
      execSync(`git add ${reviewPath}`, { cwd: repoRoot })
      execSync(
        `git commit -m "review: add codex review for ${shortHash}\n\n🤖 Generated with Ralph" --no-verify`,
        { cwd: repoRoot, stdio: 'pipe' }
      )
      displaySuccess('Review committed')
    } catch (error) {
      displayError(`Failed to commit review: ${error}`)
    }
  } else {
    displayInfo('To commit the review:')
    console.log(`  ${pc.dim('$')} ralph review ${commit} --commit`)
  }
}
