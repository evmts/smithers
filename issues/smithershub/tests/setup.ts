/**
 * Test setup for React hooks testing
 */

import '@testing-library/jest-dom'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Setup DOM environment
GlobalRegistrator.register()

// Mock console.error to reduce noise in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return
    }
    originalConsoleError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
  GlobalRegistrator.unregister()
})