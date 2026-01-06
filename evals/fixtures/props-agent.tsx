import { Claude } from '../../src/index.js'

export default function PropsAgent({ name }: { name: string }) {
  return (
    <Claude>
      Hello {name}
    </Claude>
  )
}
