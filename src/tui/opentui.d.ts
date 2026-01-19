// OpenTUI type declarations + JSX intrinsic element typing for TUI components.

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

type OpenTUIColor = string | { r: number; g: number; b: number; a?: number }

type OpenTUIBorderStyle =
  | 'single'
  | 'double'
  | 'round'
  | 'bold'
  | 'singleDouble'
  | 'doubleSingle'
  | 'classic'
  | 'none'

export type OpenTUIStyle = Omit<
  CSSProperties,
  'border' | 'borderRight' | 'backgroundColor' | 'borderColor'
> & {
  fg?: OpenTUIColor
  bg?: OpenTUIColor
  backgroundColor?: OpenTUIColor | undefined
  borderColor?: OpenTUIColor | undefined
  selectionBg?: OpenTUIColor
  selectionFg?: OpenTUIColor
  focusedBackgroundColor?: OpenTUIColor
  focusedBorderColor?: OpenTUIColor
  attributes?: number | undefined
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  hidden?: boolean
  strikethrough?: boolean
  border?: boolean | OpenTUIBorderStyle
  borderRight?: boolean | OpenTUIBorderStyle
}

export interface OpenTUIBoxProps {
  key?: string | number
  style?: OpenTUIStyle
  children?: ReactNode
}

export interface OpenTUITextProps {
  key?: string | number
  content?: string
  style?: OpenTUIStyle
  children?: ReactNode
}

export interface OpenTUIScrollBoxProps {
  key?: string | number
  focused?: boolean
  style?: OpenTUIStyle
  children?: ReactNode
}

export interface OpenTUIInputProps {
  key?: string | number
  value?: string
  placeholder?: string
  focused?: boolean
  onInput?: (value: string) => void
  onSubmit?: (value?: string) => void
  style?: OpenTUIStyle
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      box: OpenTUIBoxProps
      text: OpenTUITextProps
      scrollbox: OpenTUIScrollBoxProps
      input: OpenTUIInputProps
    }
  }
}

declare module 'react/jsx-runtime' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      box: OpenTUIBoxProps
      text: OpenTUITextProps
      scrollbox: OpenTUIScrollBoxProps
      input: OpenTUIInputProps
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      box: OpenTUIBoxProps
      text: OpenTUITextProps
      scrollbox: OpenTUIScrollBoxProps
      input: OpenTUIInputProps
    }
  }
}
