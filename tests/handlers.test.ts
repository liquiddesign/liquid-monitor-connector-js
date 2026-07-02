import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, getClient, init, teardown } from '../src/index'
import { spyOnTransportFetch, TEST_OPTIONS, type FetchSpy } from './helpers'

function dispatchErrorEvent(overrides: Record<string, unknown>): void {
  const event = new Event('error')
  Object.assign(event, overrides)
  window.dispatchEvent(event)
}

function dispatchRejectionEvent(reason: unknown): void {
  const event = new Event('unhandledrejection')
  Object.assign(event, { reason })
  window.dispatchEvent(event)
}

describe('installed handlers', () => {
  let fetchSpy: FetchSpy

  beforeEach(() => {
    fetchSpy = spyOnTransportFetch()
  })

  afterEach(() => {
    teardown()
    vi.unstubAllGlobals()
  })

  it('captures uncaught errors with stack and source location', async () => {
    init(TEST_OPTIONS)

    const error = new TypeError('x is not a function')
    dispatchErrorEvent({
      message: 'Uncaught TypeError: x is not a function',
      error,
      filename: 'https://app.test/app.js',
      lineno: 10,
      colno: 5,
    })

    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.kind).toBe('uncaught')
    expect(event.level).toBe('error')
    expect(event.message).toBe('x is not a function')
    expect(event.code).toBe('TypeError')
    expect(event.stack).toContain('TypeError')
    expect(event.source).toEqual({ file: 'https://app.test/app.js', line: 10, col: 5 })
  })

  it('captures unhandled promise rejections including non-Error reasons', async () => {
    init(TEST_OPTIONS)

    dispatchRejectionEvent(new RangeError('out of range'))
    dispatchRejectionEvent({ status: 500 })

    await flush()

    const events = fetchSpy.events()
    expect(events[0]!.kind).toBe('rejection')
    expect(events[0]!.code).toBe('RangeError')
    expect(events[0]!.message).toBe('out of range')
    expect(events[1]!.message).toBe('{"status":500}')
    expect(events[1]!.code).toBe('UnhandledRejection')
  })

  it('captures console.error with serialized arguments and Error stack', async () => {
    init(TEST_OPTIONS)

    const error = new Error('kaboom')
    console.error('Request failed', { attempt: 2 }, error)

    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.kind).toBe('console')
    expect(event.message).toBe('Request failed {"attempt":2} Error: kaboom')
    expect(event.code).toBe('Error')
    expect(event.stack).toBe(error.stack)
  })

  it('does not capture console.error emitted while the client is reporting (anti-loop)', async () => {
    init(TEST_OPTIONS)
    const client = getClient()!

    client.isReporting = true
    console.error('internal reporting noise')
    client.isReporting = false

    await flush()

    expect(fetchSpy.events()).toHaveLength(0)
  })

  it('restores console.error on teardown', () => {
    const original = console.error

    init(TEST_OPTIONS)
    expect(console.error).not.toBe(original)

    teardown()
    expect(console.error).toBe(original)
  })

  it('reports fetch responses with 5xx status as weak network events', async () => {
    init(TEST_OPTIONS)

    fetchSpy.mock.mockImplementation(async (url: unknown) =>
      String(url).includes('monitor.test')
        ? new Response('{"accepted":1}', { status: 201 })
        : new Response('oops', { status: 503 }),
    )

    await window.fetch('https://api.example/users', { method: 'POST' })
    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.kind).toBe('network')
    expect(event.level).toBe('warning')
    expect(event.code).toBe('HTTP_503')
    expect(event.message).toContain('POST https://api.example/users')
  })

  it('reports network failures thrown by fetch and rethrows them', async () => {
    init(TEST_OPTIONS)

    fetchSpy.mock.mockImplementation(async (url: unknown) => {
      if (String(url).includes('monitor.test')) {
        return new Response('{"accepted":1}', { status: 201 })
      }

      throw new TypeError('Failed to fetch')
    })

    await expect(window.fetch('https://api.example/down')).rejects.toThrow('Failed to fetch')
    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.kind).toBe('network')
    expect(event.code).toBe('NetworkError')
  })

  it('never reports requests to the monitor itself or ignored URLs', async () => {
    init({ ...TEST_OPTIONS, networkIgnoreUrls: [/analytics\.example/] })

    fetchSpy.mock.mockResolvedValue(new Response('oops', { status: 500 }))

    await window.fetch('https://monitor.test/api/browser/log')
    await window.fetch('https://analytics.example/track')
    await flush()

    expect(fetchSpy.events()).toHaveLength(0)
  })

  it('restores fetch and XHR prototypes on teardown', () => {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    init(TEST_OPTIONS)
    expect(XMLHttpRequest.prototype.open).not.toBe(originalOpen)

    teardown()
    expect(XMLHttpRequest.prototype.open).toBe(originalOpen)
    expect(XMLHttpRequest.prototype.send).toBe(originalSend)
  })

  it('flushes the queue via sendBeacon on pagehide', () => {
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon })

    init(TEST_OPTIONS)
    getClient()!.capture({ level: 'error', kind: 'manual', message: 'before unload' })

    window.dispatchEvent(new Event('pagehide'))

    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })
})
