// Type declarations for @opentui/core and @opentui/react
// These help TypeScript understand the module exports

import type { ReactNode, CSSProperties } from 'react'

declare module '@opentui/core' {
  export const TextAttributes: {
    NONE: number
    BOLD: number
    DIM: number
    ITALIC: number
    UNDERLINE: number
    BLINK: number
    INVERSE: number
    HIDDEN: number
    STRIKETHROUGH: number
  }

  export interface KeyEvent {
    name: string
    ctrl: boolean
    meta: boolean
    shift: boolean
    option: boolean
    sequence: string
    number: boolean
    raw: string
    eventType: 'press' | 'release'
    source: 'raw' | 'kitty'
    code?: string
    super?: boolean
    hyper?: boolean
    capsLock?: boolean
    numLock?: boolean
    baseCode?: number
    repeated?: boolean
    preventDefault(): void
    stopPropagation(): void
  }

  export interface CliRendererConfig {
    stdin?: NodeJS.ReadStream
    stdout?: NodeJS.WriteStream
    exitOnCtrlC?: boolean
    targetFps?: number
    maxFps?: number
    useMouse?: boolean
    useAlternateScreen?: boolean
    backgroundColor?: string
  }

  export interface CliRenderer {
    width: number
    height: number
    destroy(): void
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
  }

  export function createCliRenderer(config?: CliRendererConfig): Promise<CliRenderer>
}

declare module '@opentui/react' {
  import type { ReactNode } from 'react'
  import type { CliRenderer, KeyEvent } from '@opentui/core'

  export interface Root {
    render(node: ReactNode): void
    unmount(): void
  }

  export function createRoot(renderer: CliRenderer): Root

  export interface UseKeyboardOptions {
    release?: boolean
  }

  export function useKeyboard(handler: (key: KeyEvent) => void, options?: UseKeyboardOptions): void

  export function useTerminalDimensions(): { width: number; height: number }

  export function useRenderer(): CliRenderer | null

  export function useResize(handler: (width: number, height: number) => void): void

  export { createElement } from 'react'
}

// Extend React's CSSProperties to include OpenTUI terminal properties
declare module 'react' {
  interface CSSProperties {
    // Terminal-specific color properties
    fg?: string
    bg?: string
    // Terminal text attributes
    bold?: boolean
    dim?: boolean
    italic?: boolean
    inverse?: boolean
    strikethrough?: boolean
    // Terminal layout properties
    focusedBackgroundColor?: string
    // Allow any additional OpenTUI properties
    [key: string]: unknown
  }
}

// OpenTUI style type - allows custom terminal properties like fg, bg
export interface OpenTUIStyle extends CSSProperties {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  hidden?: boolean
  strikethrough?: boolean
  border?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'none'
  borderColor?: string
  focusedBackgroundColor?: string
  [key: string]: unknown
}

// Augment React's JSX namespace for OpenTUI elements
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // OpenTUI box element
      box: {
        key?: string | number
        style?: OpenTUIStyle
        children?: ReactNode
        [key: string]: unknown
      }
      // OpenTUI scrollbox element
      scrollbox: {
        key?: string | number
        focused?: boolean
        style?: OpenTUIStyle
        children?: ReactNode
        [key: string]: unknown
      }
    }
  }
}
