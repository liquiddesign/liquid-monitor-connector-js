import type { LqdeckEvent } from '../types'

/** Escape dots in an origin for use inside a RegExp (no regex literal — Latte-safe). */
export function escapeOriginForRegExp(origin: string): string {
  return origin.split('.').join('\\.')
}

/** Pattern matching external `.js` URLs on the given origin (webpack/Vite bundles). */
export function createOriginOwnJsPattern(origin: string): RegExp {
  return new RegExp(escapeOriginForRegExp(origin) + '[^\\s]*\\.js')
}

/** Whether the event stack or source.file references a `.js` bundle on `origin`. */
export function eventTouchesOwnJsBundle(event: LqdeckEvent, origin: string): boolean {
  const pattern = createOriginOwnJsPattern(origin)

  const hit = (value: string | undefined): boolean => typeof value === 'string' && pattern.test(value)

  return hit(event.stack) || hit(event.source?.file)
}

/**
 * Drop errors that do not originate from external `.js` bundles on the page origin.
 * Inline scripts (document URL without `.js`, including third-party pixels injected
 * after cookie consent) are filtered out.
 */
export function createOwnCodeOnlyBeforeSend(
  origin: string | undefined = typeof location !== 'undefined' ? location.origin : undefined,
): (event: LqdeckEvent) => LqdeckEvent | null {
  if (!origin) {
    return (event) => event
  }

  return (event) => (eventTouchesOwnJsBundle(event, origin) ? event : null)
}
