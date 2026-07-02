/**
 * Delivers payloads to the monitor. JSON is sent as `text/plain` so the
 * request stays a CORS "simple request" (no preflight) and the exact same
 * body works through navigator.sendBeacon on page unload.
 *
 * Holds a reference to the ORIGINAL fetch captured before the network
 * handler patches window.fetch — reporting must never flow through the
 * patched fetch or a failing monitor would report its own failures forever.
 */
export class Transport {
  private readonly originalFetch: typeof fetch | null

  constructor(private readonly ingestUrl: string) {
    this.originalFetch = typeof fetch === 'function' ? fetch.bind(globalThis) : null
  }

  async send(body: string): Promise<void> {
    if (this.originalFetch) {
      try {
        await this.originalFetch(this.ingestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
        })

        return
      } catch {
        // fall through to sendBeacon
      }
    }

    this.sendBeacon(body)
  }

  /** Fire-and-forget path used as fetch fallback and on pagehide. */
  sendBeacon(body: string): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        return navigator.sendBeacon(this.ingestUrl, new Blob([body], { type: 'text/plain' }))
      } catch {
        return false
      }
    }

    return false
  }
}
