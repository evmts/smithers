/**
 * Parallel Research Example
 *
 * Demonstrates using Subagent for parallel execution of multiple research topics.
 * Each topic is researched concurrently by its own agent, then results are combined.
 *
 * Run with: bun run examples/04-parallel-research/agent.tsx
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import {
  executePlan,
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  OutputFormat,
  type Tool,
} from '@evmts/smithers'

// =============================================================================
// Types
// =============================================================================

interface TopicResearch {
  topic: string
  status: 'pending' | 'in_progress' | 'complete'
  findings: string[]
  summary: string
}

interface ParallelResearchState {
  phase: 'research' | 'synthesize' | 'done'
  topics: TopicResearch[]
  finalReport: string | null

  initTopics: (topics: string[]) => void
  startTopic: (topic: string) => void
  updateTopic: (topic: string, data: Partial<TopicResearch>) => void
  setFinalReport: (report: string) => void
  nextPhase: () => void
}

// =============================================================================
// State
// =============================================================================

const useStore = create<ParallelResearchState>((set, get) => ({
  phase: 'research',
  topics: [],
  finalReport: null,

  initTopics: (topics) =>
    set({
      topics: topics.map((topic) => ({
        topic,
        status: 'pending',
        findings: [],
        summary: '',
      })),
    }),

  startTopic: (topic) =>
    set((state) => ({
      topics: state.topics.map((t) =>
        t.topic === topic && t.status === 'pending'
          ? { ...t, status: 'in_progress' }
          : t
      ),
    })),

  updateTopic: (topic, data) =>
    set((state) => ({
      topics: state.topics.map((t) =>
        t.topic === topic ? { ...t, ...data } : t
      ),
    })),

  setFinalReport: (report) => set({ finalReport: report }),

  nextPhase: () => {
    const { phase, topics } = get()
    // Only move to synthesize when all topics are complete
    if (phase === 'research') {
      const allComplete = topics.every((t) => t.status === 'complete')
      if (allComplete) {
        set({ phase: 'synthesize' })
      }
    } else if (phase === 'synthesize') {
      set({ phase: 'done' })
    }
  },
}))

// =============================================================================
// Tools
// =============================================================================

const webSearchTool: Tool = {
  name: 'webSearch',
  description: 'Search the web for information',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
  execute: async (args: unknown) => {
    const { query } = args as { query: string }
    // Mock implementation
    return {
      results: [
        { title: `Result 1 for ${query}`, snippet: 'Key finding...' },
        { title: `Result 2 for ${query}`, snippet: 'Another finding...' },
      ],
    }
  },
}

// =============================================================================
// Components
// =============================================================================

/**
 * Individual topic researcher - runs in parallel with other researchers
 */
function TopicResearcher({ topic }: { topic: string }) {
  const { startTopic, updateTopic, nextPhase } = useStore()

  useEffect(() => {
    startTopic(topic)
  }, [startTopic, topic])

  return (
    <Subagent name={`researcher-${topic.replace(/\s+/g, '-').toLowerCase()}`} parallel>
      <Claude
        tools={[webSearchTool]}
        onFinished={(result: unknown) => {
          const data = result as { findings: string[]; summary: string }
          console.log(`[${topic}] Research complete`)
          updateTopic(topic, {
            status: 'complete',
            findings: data.findings || [],
            summary: data.summary || '',
          })
          nextPhase() // Check if all topics are done
        }}
      >
        <Persona role="research specialist">
          You are an expert researcher focusing on: {topic}
        </Persona>

        <Phase name="research">
          <Step>Search for key information about: {topic}</Step>
          <Step>Identify the most important findings</Step>
          <Step>Summarize your research</Step>
        </Phase>

        <OutputFormat>
          Return JSON with "findings" (array of strings) and "summary" (string).
        </OutputFormat>
      </Claude>
    </Subagent>
  )
}

/**
 * Synthesizer - combines all topic research into a final report
 */
function Synthesizer() {
  const { topics, setFinalReport, nextPhase } = useStore()

  return (
    <Claude
      onFinished={(result: unknown) => {
        const data = result as { report: string }
        console.log('[Synthesizer] Report complete')
        setFinalReport(data.report)
        nextPhase()
      }}
    >
      <Persona role="research director">
        You synthesize research from multiple specialists into cohesive reports.
      </Persona>

      <Phase name="synthesize">
        <Step>Review all topic research</Step>
        <Step>Identify cross-cutting themes</Step>
        <Step>Write a unified executive summary</Step>
        <Step>Compile the final report</Step>
      </Phase>

      Here is the research from all specialists:

      {topics.map((t) => (
        `## ${t.topic}\n${t.summary}\n\nKey findings:\n${t.findings.map(f => `- ${f}`).join('\n')}\n\n`
      )).join('')}

      <OutputFormat>
        Return JSON with a "report" field containing the full markdown report.
      </OutputFormat>
    </Claude>
  )
}

/**
 * Main orchestrator for parallel research
 */
function ParallelResearchAgent({ topics }: { topics: string[] }) {
  const { phase, topics: topicState, finalReport, initTopics } = useStore()

  // Initialize topics on first render
  if (topicState.length === 0) {
    initTopics(topics)
    return null // Re-render with initialized state
  }

  console.log(`[ParallelResearch] Phase: ${phase}`)

  switch (phase) {
    case 'research':
      // Render all topic researchers in parallel
      const pendingTopics = topicState.filter((t) => t.status === 'pending')

      if (pendingTopics.length === 0) {
        // Still waiting for in-progress topics or phase transition
        return null
      }

      console.log(`[ParallelResearch] Starting ${pendingTopics.length} parallel researchers`)

      return (
        <>
          {pendingTopics.map((t) => (
            <TopicResearcher key={t.topic} topic={t.topic} />
          ))}
        </>
      )

    case 'synthesize':
      return <Synthesizer />

    case 'done':
      console.log('\n=== Parallel Research Complete ===')
      console.log('\nFinal Report:')
      console.log(finalReport?.slice(0, 800) + '...')
      return null

    default:
      return null
  }
}

// =============================================================================
// Execution
// =============================================================================

async function main() {
  // Default topics or from command line
  const defaultTopics = [
    'Transformer architectures',
    'Reinforcement learning from human feedback',
    'Chain of thought prompting',
    'AI safety and alignment',
  ]

  const topics = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : defaultTopics

  console.log(`\nStarting parallel research on ${topics.length} topics:`)
  topics.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
  console.log()

  const result = await executePlan(
    <ParallelResearchAgent topics={topics} />,
    {
      verbose: true,
      onFrame: (frame) => {
        console.log(`\n[Frame ${frame.frame}] Nodes: ${frame.executedNodes.join(', ')}`)
      },
    }
  )

  console.log('\n=== Execution Summary ===')
  console.log('Total frames:', result.frames)
  console.log('Duration:', result.totalDuration, 'ms')

  // Show final state
  const state = useStore.getState()
  console.log('\n=== Research Summary ===')
  state.topics.forEach((t) => {
    console.log(`\n${t.topic}:`)
    console.log(`  Status: ${t.status}`)
    console.log(`  Findings: ${t.findings.length}`)
  })
}

main().catch(console.error)

// Export
export { ParallelResearchAgent, useStore }
export default <ParallelResearchAgent topics={['AI agents', 'LLM applications']} />
