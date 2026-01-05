import * as readline from 'readline'
import pc from 'picocolors'

export type ApprovalChoice = 'yes' | 'no'

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
      pc.dim('(y)es / (n)o')
    )

    rl.question(pc.cyan('> '), (answer) => {
      rl.close()

      const normalized = answer.toLowerCase().trim()

      if (normalized === 'y' || normalized === 'yes') {
        resolve('yes')
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

