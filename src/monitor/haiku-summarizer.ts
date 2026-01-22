import Anthropic from '@anthropic-ai/sdk'

export interface SummaryResult {
  summary: string
  fullPath: string
}

export type SummaryType = 'read' | 'edit' | 'result' | 'error' | 'output'

type HaikuClient = {
  messages: {
    create: (params: Anthropic.Messages.MessageCreateParams) => Promise<{
      content: Anthropic.Messages.Message['content']
    }>
  }
}

export interface SummarizeOptions {
  threshold?: number
  charThreshold?: number
  maxChars?: number
  apiKey?: string
  model?: string
  client?: HaikuClient
  createClient?: (apiKey: string) => HaikuClient
  fetch?: typeof fetch
}

const PROMPTS: Record<SummaryType, string> = {
  read: 'Summarize this file content in 2-3 sentences. Focus on: what the file does, key exports/functions, and its role in the codebase.',
  edit: 'Summarize this code diff in 2-3 sentences. Focus on: what changed, why it might have changed, and the impact.',
  result: 'Summarize this AI agent result in 2-3 sentences. Focus on: what was accomplished and key findings.',
  error: 'Summarize this error in 1-2 sentences. Focus on: the root cause and suggested fix.',
  output: 'Summarize this output in 2-3 sentences. Focus on: what happened and key information.',
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
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
  options: SummarizeOptions = {}
): Promise<SummaryResult> {
  const envThreshold = parsePositiveInt(process.env['SMITHERS_SUMMARY_THRESHOLD'], 50)
  const envCharThreshold = parsePositiveInt(process.env['SMITHERS_SUMMARY_CHAR_THRESHOLD'], 4000)
  const envMaxChars = parsePositiveInt(process.env['SMITHERS_SUMMARY_MAX_CHARS'], 20000)
  const threshold = normalizePositiveInt(options.threshold, envThreshold)
  const charThreshold = normalizePositiveInt(options.charThreshold, envCharThreshold)
  const maxChars = normalizePositiveInt(options.maxChars, envMaxChars)
  const lineCount = content.split('\n').length

  // Don't summarize if below threshold
  if (lineCount < threshold && content.length < charThreshold) {
    return {
      summary: content,
      fullPath: logPath,
    }
  }

  const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY']
  const providedClient = options.client

  if (!providedClient && !apiKey) {
    // Fallback: truncate instead of summarize
    return {
      summary: truncate(content, 500) + '\n[... truncated, see full output]',
      fullPath: logPath,
    }
  }

  try {
    const client =
      providedClient ??
      (options.createClient
        ? options.createClient(apiKey!)
        : new Anthropic({ apiKey: apiKey!, ...(options.fetch ? { fetch: options.fetch } : {}) }))
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
    if (process.env['DEBUG'] || process.env['SMITHERS_DEBUG']) {
      console.debug('[haiku-summarizer] API call failed:', err)
    }
    return {
      summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
      fullPath: logPath,
    }
  }
}
