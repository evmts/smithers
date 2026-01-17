import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      claude: {
        status?: string
        result?: unknown
        error?: string
        model?: string
        children?: JSX.Element
        [key: string]: unknown
      }
      phase: {
        children?: JSX.Element
        [key: string]: unknown
      }
      step: {
        children?: JSX.Element
        [key: string]: unknown
      }
      task: {
        children?: JSX.Element
        [key: string]: unknown
      }
      agent: {
        children?: JSX.Element
        [key: string]: unknown
      }
      // Catch-all for any custom element
      [key: string]: any
    }
  }
}
