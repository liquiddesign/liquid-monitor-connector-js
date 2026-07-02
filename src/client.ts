import { Dedup } from './dedup'
import { Transport } from './transport'
import { truncate } from './serialize'
import { VERSION } from './version'
import type { ErrorLevel, EventKind, InitOptions, LqdeckEvent } from './types'

const MAX_EVENTS_PER_BATCH = 20
const MAX_MESSAGE_LENGTH = 5000
const MAX_STACK_LENGTH = 20000
const FLUSH_DELAY_MS = 500

export interface CaptureInput {
  level: ErrorLevel
  kind: EventKind
  message: string
  code?: string
  stack?: string
  source?: LqdeckEvent['source']
  extra?: Record<string, unknown>
}

export interface ResolvedConfig extends Required<Omit<InitOptions, 'beforeSend' | 'identity'>> {
  beforeSend?: InitOptions['beforeSend']
}

export class Client {
  readonly config: ResolvedConfig

  /**
   * True while a flush is being handed to the transport — the console handler
   * checks it so our own reporting can never re-enter capture().
   */
  isReporting = false

  private queue: LqdeckEvent[] = []
  private identity: Record<string, unknown> | null
  private capturedCount = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly dedup: Dedup
  private readonly transport: Transport

  constructor(options: InitOptions) {
    this.config = {
      enabled: true,
      sampleRate: 1,
      maxErrorsPerPage: 20,
      dedupeWindowMs: 30_000,
      ignoreErrors: [],
      captureConsole: true,
      captureNetwork: true,
      networkIgnoreUrls: [],
      ...options,
      url: options.url.replace(/\/+$/, ''),
    }
    this.identity = options.identity ?? null
    this.dedup = new Dedup(this.config.dedupeWindowMs)
    this.transport = new Transport(this.ingestUrl)
  }

  get ingestUrl(): string {
    return this.config.url + '/log'
  }

  setIdentity(identity: Record<string, unknown> | null): void {
    this.identity = identity
  }

  capture(input: CaptureInput): boolean {
    if (!this.config.enabled) {
      return false
    }

    if (this.capturedCount >= this.config.maxErrorsPerPage) {
      return false
    }

    if (this.config.sampleRate < 1 && Math.random() >= this.config.sampleRate) {
      return false
    }

    if (this.isIgnored(input.message)) {
      return false
    }

    if (this.dedup.isDuplicate(input.message, input.stack)) {
      return false
    }

    let event: LqdeckEvent = {
      ...input,
      message: truncate(input.message, MAX_MESSAGE_LENGTH),
      stack: input.stack ? truncate(input.stack, MAX_STACK_LENGTH) : undefined,
      url: typeof location !== 'undefined' ? location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      identity: this.identity ?? undefined,
    }

    if (this.config.beforeSend) {
      const result = this.config.beforeSend(event)

      if (!result) {
        return false
      }

      event = result
    }

    this.capturedCount++
    this.queue.push(event)
    this.scheduleFlush()

    return true
  }

  async flush(): Promise<void> {
    this.clearFlushTimer()

    while (this.queue.length > 0) {
      const body = this.payload(this.queue.splice(0, MAX_EVENTS_PER_BATCH))

      // Guard only the synchronous initiation: anything our own reporting
      // logs must not re-enter capture(), but third-party console.error
      // calls during the in-flight request should still be captured.
      this.isReporting = true
      let inFlight: Promise<void>
      try {
        inFlight = this.transport.send(body)
      } finally {
        this.isReporting = false
      }

      await inFlight
    }
  }

  /** Synchronous drain for pagehide — sendBeacon only, no awaiting. */
  flushBeacon(): void {
    this.clearFlushTimer()

    while (this.queue.length > 0) {
      this.transport.sendBeacon(this.payload(this.queue.splice(0, MAX_EVENTS_PER_BATCH)))
    }
  }

  /** Whether the network handler should skip this request URL. */
  isNetworkUrlIgnored(url: string): boolean {
    if (url.startsWith(this.config.url)) {
      return true
    }

    return this.config.networkIgnoreUrls.some((pattern) =>
      typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
    )
  }

  private isIgnored(message: string): boolean {
    return this.config.ignoreErrors.some((pattern) =>
      typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message),
    )
  }

  private payload(events: LqdeckEvent[]): string {
    return JSON.stringify({
      key: this.config.key,
      connectorVersion: VERSION,
      events,
    })
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, FLUSH_DELAY_MS)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }
}
