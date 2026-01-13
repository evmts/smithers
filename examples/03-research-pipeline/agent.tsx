/**
 * Research Pipeline Example
 *
 * A multi-phase research agent using SolidJS Store for state management.
 * Demonstrates the "Ralph Wiggum loop" - re-rendering and re-executing
 * the plan as state changes.
 *
 * Phases: gather -> analyze -> report
 *
 * Run with: bun run examples/03-research-pipeline/agent.tsx
 */
import { createStore } from 'solid-js/store'
import {
  executePlan,
  Claude,
  Phase,
  Step,
  Persona,
  OutputFormat,
  type Tool,
} from '@evmts/smithers'

// =============================================================================
// State Management with SolidJS Store
// =============================================================================

interface ResearchState {
  // Current phase
  phase: 'gather' | 'analyze' | 'report' | 'done'

  // Collected data
  sources: Array<{
    title: string
    url: string
    summary: string
  }>

  // Analysis results
  analysis: {
    themes: string[]
    insights: string[]
    gaps: string[]
  } | null

  // Final report
  report: string | null
}

const [store, setStore] = createStore<ResearchState>({
  phase: 'gather',
  sources: [],
  analysis: null,
  report: null,
})

const actions = {
  setSources: (sources: ResearchState['sources']) => setStore('sources', sources),
  setAnalysis: (analysis: ResearchState['analysis']) => setStore('analysis', analysis),
  setReport: (report: string) => setStore('report', report),
  nextPhase: () => {
    const transitions: Record<string, ResearchState['phase']> = {
      gather: 'analyze',
      analyze: 'report',
      report: 'done',
    }
    setStore('phase', transitions[store.phase] || 'done')
  },
}

// =============================================================================
// Tools
// =============================================================================

const webSearchTool: Tool = {
  name: 'webSearch',
  description: 'Search the web for information on a topic',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      maxResults: { type: 'number', description: 'Maximum results to return' },
    },
    required: ['query'],
  },
  execute: async (args: unknown) => {
    const { query } = args as { query: string }
    // Mock implementation - in production, this would call a real search API
    return {
      results: [
        { title: `Research on ${query}`, url: 'https://example.com/1', snippet: 'Key findings...' },
        { title: `${query} Analysis`, url: 'https://example.com/2', snippet: 'Further research...' },
      ],
    }
  },
}

const fileSystemTool: Tool = {
  name: 'fileSystem',
  description: 'Save files to disk',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['write'] },
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['action', 'path', 'content'],
  },
  execute: async (args: unknown) => {
    const { path, content } = args as { path: string; content: string }
    // Mock implementation - in production, this would write to the filesystem
    console.log(`[Tool] Would save to ${path}: ${content.slice(0, 100)}...`)
    // In production: await fs.promises.writeFile(path, content, 'utf-8')
    return { success: true, path }
  },
}

// =============================================================================
// Phase Components
// =============================================================================

function GatherPhase({ topic }: { topic: string }) {
  return (
    <Claude
      tools={[webSearchTool]}
      onFinished={(result: unknown) => {
        const data = result as { sources: ResearchState['sources'] }
        console.log('[Gather] Collected sources:', data.sources?.length || 0)
        actions.setSources(data.sources || [])
        actions.nextPhase()
      }}
    >
      <Persona role="research assistant">
        You are a thorough researcher who finds high-quality, credible sources.
      </Persona>

      <Phase name="gather">
        <Step>Search for recent publications about: {topic}</Step>
        <Step>Find at least 5 credible sources (academic papers, reputable publications)</Step>
        <Step>Extract key information from each source</Step>
      </Phase>

      <OutputFormat schema={{
        type: 'object',
        properties: {
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
                summary: { type: 'string' },
              },
            },
          },
        },
      }}>
        Return a JSON object with a "sources" array containing title, url, and summary for each source.
      </OutputFormat>
    </Claude>
  )
}

function AnalyzePhase() {
  return (
    <Claude
      onFinished={(result: unknown) => {
        const data = result as ResearchState['analysis']
        console.log('[Analyze] Found themes:', data?.themes?.length || 0)
        actions.setAnalysis(data)
        actions.nextPhase()
      }}
    >
      <Persona role="research analyst">
        You synthesize information and identify patterns across sources.
      </Persona>

      <Phase name="analyze">
        <Step>Review all collected sources</Step>
        <Step>Identify common themes and patterns</Step>
        <Step>Note any contradictions between sources</Step>
        <Step>Highlight knowledge gaps for further research</Step>
      </Phase>

      Here are the sources to analyze:
      {JSON.stringify(store.sources, null, 2)}

      <OutputFormat schema={{
        type: 'object',
        properties: {
          themes: { type: 'array', items: { type: 'string' } },
          insights: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
        },
      }}>
        Return a JSON object with "themes", "insights", and "gaps" arrays.
      </OutputFormat>
    </Claude>
  )
}

function ReportPhase({ topic }: { topic: string }) {
  return (
    <Claude
      tools={[fileSystemTool]}
      onFinished={(result: unknown) => {
        const data = result as { report: string }
        console.log('[Report] Generated report')
        actions.setReport(data.report)
        actions.nextPhase()
      }}
    >
      <Persona role="technical writer">
        You write clear, well-structured research reports.
      </Persona>

      <Phase name="report">
        <Step>Write an executive summary</Step>
        <Step>Detail key findings with citations</Step>
        <Step>Discuss implications and recommendations</Step>
        <Step>Save the report to output/research-report.md</Step>
      </Phase>

      <OutputFormat schema={{
        report: { type: 'string', description: 'The complete research report' },
      }}>
        Return a JSON object with a "report" field containing the full markdown report.
      </OutputFormat>

      Topic: {topic}

      Sources:
      {JSON.stringify(store.sources, null, 2)}

      Analysis:
      {JSON.stringify(store.analysis, null, 2)}

      <OutputFormat>
        Return a JSON object with a "report" field containing the full markdown report.
      </OutputFormat>
    </Claude>
  )
}

// =============================================================================
// Main Orchestrator
// =============================================================================

function ResearchPipeline({ topic }: { topic: string }) {
  console.log(`[ResearchPipeline] Current phase: ${store.phase}`)

  // Return a closure for reactivity
  return () => {
    switch (store.phase) {
      case 'gather':
        return <GatherPhase topic={topic} />

      case 'analyze':
        return <AnalyzePhase />

      case 'report':
        return <ReportPhase topic={topic} />

      case 'done':
        // No more Claude components - the loop will end
        console.log('\n=== Research Complete ===')
        console.log('Final report preview:')
        console.log(store.report?.slice(0, 500) + '...')
        return null

      default:
        return null
    }
  }
}

// =============================================================================
// Execution
// =============================================================================

async function main() {
  const topic = process.argv[2] || 'Large Language Model agents and autonomous systems'

  console.log(`\nStarting research pipeline on: "${topic}"\n`)
  console.log('Phases: gather -> analyze -> report\n')

  const result = await executePlan(() => <ResearchPipeline topic={topic} />,
 {
    verbose: true,
    onFrame: (frame) => {
      console.log(`\n[Frame ${frame.frame}] Executed: ${frame.executedNodes.join(', ')}`)
    },
  })

  console.log('\n=== Execution Summary ===')
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')

  // Display final state
  console.log('\n=== Final State ===')
  console.log('Sources collected:', store.sources.length)
  console.log('Themes identified:', store.analysis?.themes?.length || 0)
  console.log('Report generated:', store.report ? 'Yes' : 'No')
}

main().catch(console.error)

// Export for use as a module
export { ResearchPipeline, store as researchStore }
export default (() => <ResearchPipeline topic="AI agents" />)