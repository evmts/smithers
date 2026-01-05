import * as readline from 'readline'
import pc from 'picocolors'

export type ApprovalChoice = 'yes' | 'no' | 'edit'

/**
 * Prompt user for plan approval (Terraform-style)
 */
export async function promptApproval(): Promise<ApprovalChoice> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    console.log()
    console.log(
      pc.bold('Do you want to execute this plan?'),
      pc.dim('(y)es / (n)o / (e)dit')
    )

    rl.question(pc.cyan('> '), (answer) => {
      rl.close()

      const normalized = answer.toLowerCase().trim()

      if (normalized === 'y' || normalized === 'yes') {
        resolve('yes')
      } else if (normalized === 'e' || normalized === 'edit') {
        resolve('edit')
      } else {
        resolve('no')
      }
    })
  })
}

/**
 * Prompt for confirmation (simple yes/no)
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${message} ${pc.dim('(y/n)')} `, (answer) => {
      rl.close()
      const normalized = answer.toLowerCase().trim()
      resolve(normalized === 'y' || normalized === 'yes')
    })
  })
}

/**
 * Open plan in editor for editing
 *
 * STUB: Will open $EDITOR with the plan file
 */
export async function editPlan(plan: string): Promise<string> {
  // STUB: For now, just return the original plan
  console.log(pc.yellow('Edit mode not yet implemented'))
  return plan
}
