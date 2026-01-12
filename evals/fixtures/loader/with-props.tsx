import { Claude } from '@evmts/smithers'

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
