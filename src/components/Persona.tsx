import type { ReactNode } from 'react'

export interface PersonaProps {
  role?: string
  children?: ReactNode
  [key: string]: unknown
}

export function Persona(props: PersonaProps): ReactNode {
  return (
    <persona {...(props.role ? { role: props.role } : {})}>
      {props.children}
    </persona>
  )
}
