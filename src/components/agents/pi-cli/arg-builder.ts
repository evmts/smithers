import type { PiCLIExecutionOptions } from '../types/pi.js'

export function buildPiArgs(options: PiCLIExecutionOptions): string[] {
  const args: string[] = ['--mode', 'json', '-p', '--no-session']
  
  if (options.provider) args.push('--provider', options.provider)
  if (options.model) args.push('--model', options.model)
  if (options.thinking) args.push('--thinking', options.thinking)
  if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt)
  if (options.appendSystemPrompt) args.push('--append-system-prompt', options.appendSystemPrompt)
  if (options.tools?.length) args.push('--tools', options.tools.join(','))
  
  args.push(options.prompt)
  return args
}
