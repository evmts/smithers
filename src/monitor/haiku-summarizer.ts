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

function clipForSummary(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  if (maxLength <= 20) return truncate(content, maxLength)
  const headLength = Math.floor(maxLength * 0.6)
  const tailLength = maxLength - headLength
  const head = content.substring(0, headLength)
  const tail = content.substring(content.length - tailLength)
  return `${head}\n...[content truncated for summarization]...\n${tail}`
}

function joinTextBlocks(content: Anthropic.Messages.Message['content']): string {
  const textBlocks = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .filter((text) => text.length > 0)
  return textBlocks.length > 0 ? textBlocks.join('\n') : ''
}

export async function summarizeWithHaiku(
  content: string,
  type: SummaryType,
  logPath: string,
  options: {
    threshold?: number
    charThreshold?: number
    maxChars?: number
    apiKey?: string
    model?: string
  } = {}
): Promise<SummaryResult> {
  const threshold = options.threshold || parseInt(process.env['SMITHERS_SUMMARY_THRESHOLD'] || '50', 10)
  const charThreshold =
    options.charThreshold || parseInt(process.env['SMITHERS_SUMMARY_CHAR_THRESHOLD'] || '4000', 10)
  const maxChars = options.maxChars || parseInt(process.env['SMITHERS_SUMMARY_MAX_CHARS'] || '20000', 10)
  const lineCount = content.split('\n').length

  // Don't summarize if below threshold
  if (lineCount < threshold && content.length < charThreshold) {
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
    const model = options.model || process.env['SMITHERS_SUMMARY_MODEL'] || 'claude-3-haiku-20240307'
    const clippedContent = clipForSummary(content, maxChars)

    const response = await client.messages.create({
      model,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `${PROMPTS[type]}\n\n---\n${clippedContent}`,
        },
      ],
    })

    const summary = joinTextBlocks(response.content) || truncate(content, 500)

    return {
      summary,
      fullPath: logPath,
    }
  } catch (err) {
    console.warn('[haiku-summarizer] API call failed:', err instanceof Error ? err.message : String(err))
    return {
      summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
      fullPath: logPath,
    }
  }
}
