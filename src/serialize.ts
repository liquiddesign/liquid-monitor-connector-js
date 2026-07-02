export interface DescribedError {
  message: string
  code?: string
  stack?: string
}

/** Normalize anything thrown/rejected/logged into message + code + stack. */
export function describeError(err: unknown): DescribedError {
  if (err instanceof Error) {
    return {
      message: err.message || String(err),
      code: err.name || undefined,
      stack: err.stack,
    }
  }

  if (typeof err === 'string') {
    return { message: err }
  }

  return { message: safeStringify(err) }
}

export function safeStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  try {
    const json = JSON.stringify(value)

    return typeof json === 'string' ? json : String(value)
  } catch {
    return String(value)
  }
}

export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}
