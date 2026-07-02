export type ErrorLevel = 'debug' | 'info' | 'warning' | 'error' | 'exception' | 'critical'

export type EventKind = 'uncaught' | 'rejection' | 'console' | 'network' | 'manual'

export interface EventSource {
  file?: string
  line?: number
  col?: number
}

/** One error event as accepted by the monitor's POST /api/browser/log endpoint. */
export interface LqdeckEvent {
  level: ErrorLevel
  message: string
  code?: string
  url?: string
  stack?: string
  kind: EventKind
  source?: EventSource
  userAgent?: string
  identity?: Record<string, unknown>
  extra?: Record<string, unknown>
}

export interface InitOptions {
  /** Base browser API URL of the monitor, e.g. `https://monitor.example/api/browser`. */
  url: string
  /** Public project key (`jsk_…`) from the LQDeck project settings. */
  key: string
  /** Master switch — when false, nothing is installed or sent. Default true. */
  enabled?: boolean
  /** Fraction of captured events to actually send (0–1). Default 1. */
  sampleRate?: number
  /** Hard cap of events sent per page load. Default 20. */
  maxErrorsPerPage?: number
  /** Identical errors within this window are sent only once. Default 30000. */
  dedupeWindowMs?: number
  /** Messages matching any entry are dropped. */
  ignoreErrors?: Array<string | RegExp>
  /** Patch console.error and report its calls. Default true. */
  captureConsole?: boolean
  /** Patch fetch/XHR and report 5xx responses and network failures. Default true. */
  captureNetwork?: boolean
  /** Request URLs matching any entry are never reported by the network handler. */
  networkIgnoreUrls?: Array<string | RegExp>
  /** Last-chance hook: mutate the event, or return null/false to drop it. */
  beforeSend?: (event: LqdeckEvent) => LqdeckEvent | null | false | undefined
  /** User/session identity attached to every event. */
  identity?: Record<string, unknown> | null
}
