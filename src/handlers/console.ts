import { describeError, safeStringify } from '../serialize'
import type { Client } from '../client'

/**
 * Monkey-patches console.error. The original is always called first; the
 * capture is skipped while the client itself is reporting (anti-loop).
 * Returns a teardown function restoring the original.
 */
export function installConsoleHandler(client: Client): () => void {
  const original = console.error

  console.error = (...args: unknown[]): void => {
    original.apply(console, args)

    if (client.isReporting) {
      return
    }

    const firstError = args.find((arg): arg is Error => arg instanceof Error)

    client.capture({
      level: 'error',
      kind: 'console',
      message: args.map(formatConsoleArg).join(' ') || 'console.error',
      code: firstError ? describeError(firstError).code : 'console.error',
      stack: firstError?.stack,
    })
  }

  return () => {
    console.error = original
  }
}

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`
  }

  return safeStringify(arg)
}
