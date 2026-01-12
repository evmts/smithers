import { useState } from 'react'
import { Claude } from '@evmts/smithers'

export default function Agent() {
  const [message] = useState('Using hooks')

  return (
    <Claude>
      {message}
    </Claude>
  )
}
