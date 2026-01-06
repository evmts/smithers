import { Claude } from '../../../src/components/index.js'

interface AgentProps {
  task: string
}

export default function Agent({ task }: AgentProps) {
  return (
    <Claude>
      Performing task: {task}
    </Claude>
  )
}
