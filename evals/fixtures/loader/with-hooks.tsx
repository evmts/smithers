import { useState } from 'react'
import { Claude } from '../../../src/components/index.js'

export default function Agent() {
  const [message] = useState('Using hooks')

  return (
    <Claude>
      {message}
    </Claude>
  )
}
