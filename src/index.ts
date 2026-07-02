import { Client } from './client'
import { describeError } from './serialize'
import { installConsoleHandler } from './handlers/console'
import { installNetworkHandler } from './handlers/network'
import { installRejectionHandler } from './handlers/rejection'
import { installUncaughtHandler } from './handlers/uncaught'
import { VERSION } from './version'
import type { ErrorLevel, InitOptions, LqdeckEvent } from './types'

export type { ErrorLevel, EventKind, InitOptions, LqdeckEvent } from './types'
export { VERSION }

let client: Client | null = null
let teardowns: Array<() => void> = []

/**
 * Initialize the connector: install error handlers and start reporting to
 * the monitor. Call once, as early as possible. Repeated calls tear down the
 * previous instance and reinitialize.
 */
export function init(options: InitOptions): void {
  teardown()

  client = new Client(options)

  if (!client.config.enabled || typeof window === 'undefined') {
    return
  }

  teardowns.push(installUncaughtHandler(client))
  teardowns.push(installRejectionHandler(client))

  if (client.config.captureConsole) {
    teardowns.push(installConsoleHandler(client))
  }

  if (client.config.captureNetwork) {
    teardowns.push(installNetworkHandler(client))
  }

  teardowns.push(installPagehideFlush(client))
}

/** Report a caught error manually. */
export function captureError(err: unknown, extra?: Record<string, unknown>): void {
  const info = describeError(err)

  client?.capture({
    level: 'error',
    kind: 'manual',
    message: info.message,
    code: info.code,
    stack: info.stack ?? new Error().stack,
    extra,
  })
}

/** Report a plain message at the given level. */
export function captureMessage(message: string, level: ErrorLevel = 'info', extra?: Record<string, unknown>): void {
  client?.capture({
    level,
    kind: 'manual',
    message,
    extra,
  })
}

/** Attach (or clear) the user/session identity sent with every event. */
export function setIdentity(identity: Record<string, unknown> | null): void {
  client?.setIdentity(identity)
}

/** Send everything queued right now. */
export async function flush(): Promise<void> {
  await client?.flush()
}

/** Remove all installed handlers and drop the client. Mostly for tests/SPA teardown. */
export function teardown(): void {
  for (const fn of teardowns) {
    fn()
  }

  teardowns = []
  client = null
}

/** Internal accessor for framework adapters and tests. */
export function getClient(): Client | null {
  return client
}

function installPagehideFlush(activeClient: Client): () => void {
  const onHidden = (): void => {
    activeClient.flushBeacon()
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      onHidden()
    }
  }

  window.addEventListener('pagehide', onHidden)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('pagehide', onHidden)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
