import type { JSX as SolidJSX } from 'solid-js/types/jsx'
import type { SmithersIntrinsicElements } from '../components/index.tsx'

declare global {
  namespace JSX {
    interface IntrinsicElements
      extends SolidJSX.IntrinsicElements,
        SmithersIntrinsicElements {}
  }
}

export {}
