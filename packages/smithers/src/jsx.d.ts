/**
 * JSX type definitions for Smithers custom elements
 */

import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      claude: any
      phase: any
      step: any
      ralph: any
      persona: any
      constraints: any
      stop: any
      [key: string]: any
    }
  }
}
