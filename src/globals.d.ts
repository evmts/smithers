// Global type declarations

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string
      MOCK_MODE?: string
    }
  }

  var process: {
    env: NodeJS.ProcessEnv
  }
}

export {}
