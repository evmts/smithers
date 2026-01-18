// Type declarations for @opentui/core and @opentui/react
// These help TypeScript understand the module exports

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

// JSX intrinsic elements for OpenTUI components
declare global {
  namespace JSX {
    interface IntrinsicElements {
      box: {
        key?: string | number
        style?: Record<string, unknown>
        children?: ReactNode
      }
      text: {
        key?: string | number
        content?: string
        style?: Record<string, unknown>
        children?: ReactNode
      }
      scrollbox: {
        key?: string | number
        focused?: boolean
        style?: Record<string, unknown>
        children?: ReactNode
      }
      input: {
        key?: string | number
        value?: string
        placeholder?: string
        focused?: boolean
        onInput?: (value: string) => void
        onSubmit?: () => void
        style?: Record<string, unknown>
      }
    }
  }
}
