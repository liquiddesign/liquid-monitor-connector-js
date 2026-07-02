/**
 * Suppresses repeats of the same error (message + first stack frame) within a
 * sliding window, so error loops don't turn into request loops.
 */
export class Dedup {
  private seen = new Map<string, number>()

  constructor(private readonly windowMs: number) {}

  isDuplicate(message: string, stack?: string, now: number = Date.now()): boolean {
    const key = message + '|' + firstStackFrame(stack)
    const last = this.seen.get(key)

    if (last !== undefined && now - last < this.windowMs) {
      return true
    }

    this.prune(now)
    this.seen.set(key, now)

    return false
  }

  private prune(now: number): void {
    if (this.seen.size < 100) {
      return
    }

    for (const [key, at] of this.seen) {
      if (now - at >= this.windowMs) {
        this.seen.delete(key)
      }
    }
  }
}

export function firstStackFrame(stack?: string): string {
  if (!stack) {
    return ''
  }

  for (const line of stack.split('\n')) {
    const trimmed = line.trim()

    // V8 frames start with "at ", Firefox/Safari frames contain "@".
    if (trimmed.startsWith('at ') || trimmed.includes('@')) {
      return trimmed
    }
  }

  return ''
}
