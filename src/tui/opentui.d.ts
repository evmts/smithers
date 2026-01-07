/**
 * Custom type declarations for OpenTUI
 * Augments the existing OpenTUI types to add missing JSX elements
 */

import type { ReactNode } from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * OpenTUI box element for layouts
       */
      box: {
        children?: ReactNode
        flexDirection?: 'row' | 'column'
        alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch'
        justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around'
        width?: number | string
        height?: number | string
        paddingLeft?: number
        paddingRight?: number
        paddingTop?: number
        paddingBottom?: number
        borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'classic'
        borderColor?: string
        background?: string
        color?: string
        [key: string]: any
      }

      /**
       * OpenTUI scrollbox element for scrollable content
       */
      scrollbox: {
        children?: ReactNode
        width?: number | string
        height?: number | string
        scrollY?: number
        scrollX?: number
        [key: string]: any
      }
    }
  }
}

export {}
