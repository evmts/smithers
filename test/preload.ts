/**
 * Test preload file for Smithers tests.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Register happy-dom globals for DOM testing
GlobalRegistrator.register()

// Set mock mode for all tests
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
