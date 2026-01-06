import { Command } from 'commander'
import pc from 'picocolors'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'

import { renderPlan } from '../../core/render.js'
import { displayPlan, displayError, info } from '../display.js'
import { loadAgentFile } from '../loader.js'
import { parseProps } from '../props.js'

export const planCommand = new Command('plan')
  .description('Render and display the XML plan without executing')
  .argument('<file>', 'Path to the agent file (.mdx or .tsx)')
  .option('--json', 'Output plan as JSON instead of XML')
  .option('-o, --output <file>', 'Write plan to file')
  .option('-p, --props <json>', 'JSON string of props to pass to the agent')
  .action(async (file: string, options) => {
    try {
      await plan(file, options)
    } catch (error) {
      displayError(error as Error)
      process.exit(1)
    }
  })

interface PlanOptions {
  json?: boolean
  output?: string
  props?: string
}

async function plan(file: string, options: PlanOptions): Promise<void> {
  // Resolve file path
  const filePath = path.resolve(process.cwd(), file)

  // Check file exists and is a file (not directory)
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`)
  }

  info(`Loading agent from ${pc.cyan(file)}`)

  // Load and compile the agent file
  const spinner = ora('Compiling agent...').start()

  let element
  const props = parseProps(options.props)
  try {
    element = await loadAgentFile(filePath, { props })
    spinner.succeed('Agent compiled')
  } catch (error) {
    spinner.fail('Failed to compile agent')
    throw error
  }

  // Render the plan
  const planSpinner = ora('Rendering plan...').start()
  const planXml = await renderPlan(element)
  planSpinner.succeed('Plan rendered')

  // Output the plan
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output)

    if (options.json) {
      // Convert XML to JSON structure (simplified)
      const jsonPlan = { xml: planXml }
      fs.writeFileSync(outputPath, JSON.stringify(jsonPlan, null, 2))
    } else {
      fs.writeFileSync(outputPath, planXml)
    }

    info(`Plan written to ${pc.cyan(options.output)}`)
  } else if (options.json) {
    console.log(JSON.stringify({ xml: planXml }, null, 2))
  } else {
    displayPlan(planXml)
  }
}
