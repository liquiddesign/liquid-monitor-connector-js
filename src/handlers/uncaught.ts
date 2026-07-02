import { describeError } from '../serialize'
import type { Client } from '../client'

/** window "error" events — uncaught exceptions. Resource-load errors (plain
 * Events without a message) are ignored; the network handler covers those
 * signals where they matter. Returns a teardown function. */
export function installUncaughtHandler(client: Client): () => void {
  const handler = (event: Event): void => {
    const errorEvent = event as ErrorEvent

    if (errorEvent.message === undefined && errorEvent.error === undefined) {
      return
    }

    const info = describeError(errorEvent.error ?? errorEvent.message)

    client.capture({
      level: 'error',
      kind: 'uncaught',
      message: info.message || String(errorEvent.message ?? 'Unknown error'),
      code: info.code ?? 'Error',
      stack: info.stack,
      source: errorEvent.filename
        ? { file: errorEvent.filename, line: errorEvent.lineno, col: errorEvent.colno }
        : undefined,
    })
  }

  window.addEventListener('error', handler)

  return () => window.removeEventListener('error', handler)
}
