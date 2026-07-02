import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../src/client'
import { spyOnTransportFetch, TEST_OPTIONS, type FetchSpy } from './helpers'
import type { CaptureInput } from '../src/client'

const input = (overrides: Partial<CaptureInput> = {}): CaptureInput => ({
  level: 'error',
  kind: 'manual',
  message: 'Something broke',
  ...overrides,
})

describe('Client', () => {
  let fetchSpy: FetchSpy

  beforeEach(() => {
    fetchSpy = spyOnTransportFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends captured events as a text/plain batch with key and version', async () => {
    const client = new Client(TEST_OPTIONS)

    expect(client.capture(input({ code: 'TypeError', stack: 'TypeError: x\n    at run (app.js:1:1)' }))).toBe(true)
    await client.flush()

    expect(fetchSpy.mock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://monitor.test/api/browser/log')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')

    const batch = fetchSpy.batches()[0]!
    expect(batch.key).toBe('jsk_test')
    expect(batch.connectorVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(batch.events[0]!.message).toBe('Something broke')
    expect(batch.events[0]!.code).toBe('TypeError')
  })

  it('deduplicates identical errors within the window and allows them after it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const client = new Client({ ...TEST_OPTIONS, dedupeWindowMs: 30_000 })

    expect(client.capture(input())).toBe(true)
    expect(client.capture(input())).toBe(false)

    vi.setSystemTime(31_000)
    expect(client.capture(input())).toBe(true)
  })

  it('treats a different first stack frame as a different error', () => {
    const client = new Client(TEST_OPTIONS)

    expect(client.capture(input({ stack: 'Error: x\n    at a (app.js:1:1)' }))).toBe(true)
    expect(client.capture(input({ stack: 'Error: x\n    at b (app.js:9:9)' }))).toBe(true)
  })

  it('stops capturing above maxErrorsPerPage', () => {
    const client = new Client({ ...TEST_OPTIONS, maxErrorsPerPage: 2 })

    expect(client.capture(input({ message: 'first' }))).toBe(true)
    expect(client.capture(input({ message: 'second' }))).toBe(true)
    expect(client.capture(input({ message: 'third' }))).toBe(false)
  })

  it('drops messages matching ignoreErrors strings and regexes', () => {
    const client = new Client({
      ...TEST_OPTIONS,
      ignoreErrors: ['ResizeObserver loop', /^Script error/],
    })

    expect(client.capture(input({ message: 'ResizeObserver loop limit exceeded' }))).toBe(false)
    expect(client.capture(input({ message: 'Script error.' }))).toBe(false)
    expect(client.capture(input({ message: 'Real failure' }))).toBe(true)
  })

  it('drops everything when sampleRate is 0 and disabled clients capture nothing', () => {
    const sampled = new Client({ ...TEST_OPTIONS, sampleRate: 0 })
    expect(sampled.capture(input())).toBe(false)

    const disabled = new Client({ ...TEST_OPTIONS, enabled: false })
    expect(disabled.capture(input())).toBe(false)
  })

  it('lets beforeSend mutate or drop events', async () => {
    const client = new Client({
      ...TEST_OPTIONS,
      beforeSend: (event) => {
        if (event.message.includes('secret')) {
          return null
        }

        return { ...event, extra: { tagged: true } }
      },
    })

    expect(client.capture(input({ message: 'contains secret token' }))).toBe(false)
    expect(client.capture(input({ message: 'plain failure' }))).toBe(true)

    await client.flush()

    expect(fetchSpy.events()[0]!.extra).toEqual({ tagged: true })
  })

  it('splits large queues into batches of 20', async () => {
    const client = new Client({ ...TEST_OPTIONS, maxErrorsPerPage: 100 })

    for (let i = 0; i < 25; i++) {
      client.capture(input({ message: `error ${i}` }))
    }

    await client.flush()

    expect(fetchSpy.mock).toHaveBeenCalledTimes(2)
    expect(fetchSpy.batches()[0]!.events).toHaveLength(20)
    expect(fetchSpy.batches()[1]!.events).toHaveLength(5)
  })

  it('falls back to sendBeacon when fetch fails', async () => {
    const sendBeacon = vi.fn<(url: string, data?: BodyInit) => boolean>(() => true)
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon })
    fetchSpy.mock.mockRejectedValue(new TypeError('Failed to fetch'))

    const client = new Client(TEST_OPTIONS)
    client.capture(input())
    await client.flush()

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0]![0]).toBe('https://monitor.test/api/browser/log')
  })

  it('drains the queue via sendBeacon on flushBeacon (pagehide path)', () => {
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon })

    const client = new Client(TEST_OPTIONS)
    client.capture(input())
    client.flushBeacon()

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock).not.toHaveBeenCalled()
  })

  it('attaches identity set via setIdentity and clears it again', async () => {
    const client = new Client(TEST_OPTIONS)

    client.setIdentity({ userId: 42 })
    client.capture(input({ message: 'with identity' }))

    client.setIdentity(null)
    client.capture(input({ message: 'without identity' }))

    await client.flush()

    const events = fetchSpy.events()
    expect(events[0]!.identity).toEqual({ userId: 42 })
    expect(events[1]!.identity).toBeUndefined()
  })

  it('truncates oversized messages to the API limit', async () => {
    const client = new Client(TEST_OPTIONS)

    client.capture(input({ message: 'x'.repeat(6000) }))
    await client.flush()

    expect(fetchSpy.events()[0]!.message.length).toBeLessThanOrEqual(5000)
  })
})
