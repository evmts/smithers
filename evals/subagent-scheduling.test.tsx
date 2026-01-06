import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { create } from 'zustand'

import { createRoot, executePlan, findPendingExecutables, Claude, Subagent } from '../src/index.js'

describe('subagent scheduling', () => {
  test('findPendingExecutables only returns Claude nodes', async () => {
    function Agent() {
      return (
        <Subagent name="worker">
          <Claude>Do work</Claude>
        </Subagent>
      )
    }

    const root = createRoot()
    const tree = await root.render(<Agent />)
    const pending = findPendingExecutables(tree)
    root.unmount()

    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('claude')
  })

  test('parallel=false subagents execute sequentially across frames', async () => {
    const useStore = create<{
      count: number
      increment: () => void
    }>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }))

    function SequentialAgent() {
      const { increment } = useStore()

      return (
        <>
          <Subagent name="first" parallel={false}>
            <Claude onFinished={increment}>First</Claude>
          </Subagent>
          <Subagent name="second" parallel={false}>
            <Claude onFinished={increment}>Second</Claude>
          </Subagent>
        </>
      )
    }

    const result = await executePlan(<SequentialAgent />, { mockMode: true, maxFrames: 5 })

    expect(useStore.getState().count).toBe(2)
    expect(result.frames).toBe(3)
  })
})
