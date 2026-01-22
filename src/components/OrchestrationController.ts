import { createContext, useContext } from 'react'

export type OrchestrationController = {
  resolve: () => void
  reject: (err: Error) => void
}

const orchestrationControllers = new Map<string, OrchestrationController>()

export const OrchestrationTokenContext = createContext<string | null>(null)

export function createOrchestrationPromise(): { promise: Promise<void>; token: string } {
  const token = crypto.randomUUID()
  const promise = new Promise<void>((resolve, reject) => {
    orchestrationControllers.set(token, { resolve, reject })
  })
  return { promise, token }
}

export function signalOrchestrationCompleteByToken(token: string): void {
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.resolve()
    orchestrationControllers.delete(token)
  }
}

export function signalOrchestrationErrorByToken(token: string, err: Error): void {
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.reject(err)
    orchestrationControllers.delete(token)
  }
}

export function useOrchestrationToken(): string | null {
  return useContext(OrchestrationTokenContext)
}
