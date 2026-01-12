import { Claude } from '@evmts/smithers'

export default function PropsAgent({ name }: { name: string }) {
  return (
    <Claude>
      Hello {name}
    </Claude>
  )
}
