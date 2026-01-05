import { useState, useEffect } from 'react'
import { createRoot } from './src/core/render.js'
import { serialize } from './src/core/render.js'

function MyAgent() {
  const [phase, setPhase] = useState('phase1')
  console.log(`[MyAgent] Rendering, phase = ${phase}`)

  // Try updating state in useEffect (the "React way")
  useEffect(() => {
    console.log(`[MyAgent] useEffect running, phase = ${phase}`)
    if (phase === 'phase1') {
      console.log('[MyAgent] Calling setPhase from useEffect')
      setPhase('phase2')
    }
  }, [phase])

  if (phase === 'phase1') {
    return <claude>Phase 1</claude>
  }

  return <claude>Phase 2</claude>
}

const root = createRoot()

async function main() {
  console.log('\n=== Render 1 ===')
  const element = <MyAgent />
  const tree1 = await root.render(element)
  console.log('Tree:', serialize(tree1))
}

main().catch((error) => {
  console.error('[debug-state] Error:', error)
})
