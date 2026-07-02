import { describeError } from '../serialize'
import type { Client } from '../client'

/** window "unhandledrejection" events. Returns a teardown function. */
export function installRejectionHandler(client: Client): () => void {
  const handler = (event: Event): void => {
    const info = describeError((event as PromiseRejectionEvent).reason)

    client.capture({
      level: 'error',
      kind: 'rejection',
      message: info.message || 'Unhandled promise rejection',
      code: info.code ?? 'UnhandledRejection',
      stack: info.stack,
    })
  }

  window.addEventListener('unhandledrejection', handler)

  return () => window.removeEventListener('unhandledrejection', handler)
}
