import { vi, type Mock } from 'vitest'
import type { LqdeckEvent } from '../src/types'

export interface SentBatch {
  key: string
  connectorVersion: string
  events: LqdeckEvent[]
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface FetchSpy {
  mock: Mock<FetchLike>
  batches: () => SentBatch[]
  events: () => LqdeckEvent[]
}

/**
 * Stub global fetch and collect the ingest payloads the connector sends.
 * Only calls that look like transport deliveries (POST to …/log with a string
 * body) count as batches — the network-handler tests issue their own fetch
 * calls through the same stub.
 */
export function spyOnTransportFetch(): FetchSpy {
  const mock = vi.fn<FetchLike>(async () => new Response('{"accepted":1}', { status: 201 }))

  vi.stubGlobal('fetch', mock)

  const batches = (): SentBatch[] =>
    mock.mock.calls
      .filter(([url, init]) => String(url).endsWith('/log') && typeof init?.body === 'string')
      .map(([, init]) => JSON.parse(init!.body as string) as SentBatch)

  return {
    mock,
    batches,
    events: () => batches().flatMap((batch) => batch.events),
  }
}

export const TEST_OPTIONS = {
  url: 'https://monitor.test/api/browser',
  key: 'jsk_test',
}
