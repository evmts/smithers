/**
 * Test preload file for configuring the JSX runtime.
 */
import { jsx, jsxs, Fragment } from '../src/jsx-runtime'

// Provide a React shim using our custom jsx-runtime
// @ts-expect-error - globalThis.React
globalThis.React = {
  createElement: (type: any, props: any, ...children: any[]) => {
    // Convert React.createElement args to jsx() format
    const combinedProps = { ...props }
    if (children.length === 1) {
      combinedProps.children = children[0]
    } else if (children.length > 1) {
      combinedProps.children = children
    }
    return jsx(type, combinedProps)
  },
  Fragment,
}

// Set mock mode for all tests
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
