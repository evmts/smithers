import { createSmithersRoot } from '../src/reconciler/root.js'
import { createSmithersDB } from '../src/db/index.js'
import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { useRef } from 'react'

function TestComponent() {
  const valueRef = useRef('hook-works')
  return <div>{valueRef.current}</div>
}

async function App() {
  const db = await createSmithersDB({ path: ':memory:' })
  const execId = await db.execution.start('test', 'test.tsx')

  return (
    <SmithersProvider db={db} executionId={execId}>
      <TestComponent />
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(App)
const xml = root.toXML()

if (xml.includes('hook-works')) {
  console.log('✓ Hooks work correctly through JSX')
  process.exit(0)
} else {
  console.error('✗ Hooks failed')
  console.error(xml)
  process.exit(1)
}
