import Anthropic from '@anthropic-ai/sdk'

export interface SummaryResult {
  summary: string
  fullPath: string
}

export type SummaryType = 'read' | 'edit' | 'result' | 'error' | 'output'

const PROMPTS: Record<SummaryType, string> = {
  read: 'Summarize this file content in 2-3 sentences. Focus on: what the file does, key exports/functions, and its role in the codebase.',
  edit: 'Summarize this code diff in 2-3 sentences. Focus on: what changed, why it might have changed, and the impact.',
  result: 'Summarize this AI agent result in 2-3 sentences. Focus on: what was accomplished and key findings.',
  error: 'Summarize this error in 1-2 sentences. Focus on: the root cause and suggested fix.',
  output: 'Summarize this output in 2-3 sentences. Focus on: what happened and key information.',
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

export async function summarizeWithHaiku(
  content: string,
  type: SummaryType,
  logPath: string,
  options: {
    threshold?: number
    apiKey?: string
  } = {}
): Promise<SummaryResult> {
  const threshold = options.threshold || parseInt(process.env['SMITHERS_SUMMARY_THRESHOLD'] || '50')
  const lineCount = content.split('\n').length

  // Don't summarize if below threshold
  if (lineCount < threshold) {
    return {
      summary: content,
      fullPath: logPath,
    }
  }

  const apiKey = options.apiKey || process.env['ANTHROPIC_API_KEY']

  if (!apiKey) {
    // Fallback: truncate instead of summarize
    return {
      summary: truncate(content, 500) + '\n[... truncated, see full output]',
      fullPath: logPath,
    }
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `${PROMPTS[type]}\n\n---\n${content}`,
        },
      ],
    })

    const text = response.content[0]
    const summary = text && text.type === 'text' && 'text' in text ? text.text : content

    return {
      summary,
      fullPath: logPath,
    }
  } catch {
    // Fallback on error
    return {
      summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
      fullPath: logPath,
    }
  }
}
