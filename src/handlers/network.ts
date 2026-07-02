import type { Client } from '../client'

interface XhrMeta {
  method: string
  url: string
}

const XHR_META = '__lqdeckMeta'

/**
 * Patches window.fetch and XMLHttpRequest to report server errors (5xx) and
 * outright network failures as weak `network` events (level warning).
 *
 * Anti-loop: requests to the monitor itself and any configured ignore URLs
 * are never reported (the reporting transport additionally uses the original
 * unpatched fetch, so even its failures cannot recurse). Returns a teardown.
 */
export function installNetworkHandler(client: Client): () => void {
  const teardowns: Array<() => void> = []

  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const originalFetch = window.fetch

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = requestUrl(input)
      const method = requestMethod(input, init)

      try {
        const response = await originalFetch.call(window, input, init)

        if (response.status >= 500 && !client.isNetworkUrlIgnored(url)) {
          captureNetworkEvent(client, method, url, `HTTP ${response.status}`, `HTTP_${response.status}`)
        }

        return response
      } catch (err) {
        if (!client.isNetworkUrlIgnored(url)) {
          captureNetworkEvent(client, method, url, err instanceof Error ? err.message : 'network failure', 'NetworkError')
        }

        throw err
      }
    }

    teardowns.push(() => {
      window.fetch = originalFetch
    })
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
      ;(this as XMLHttpRequest & Record<string, unknown>)[XHR_META] = {
        method: method.toUpperCase(),
        url: String(url),
      } satisfies XhrMeta

      // eslint-disable-next-line prefer-rest-params
      return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>)
    }

    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]): void {
      const meta = (this as XMLHttpRequest & Record<string, unknown>)[XHR_META] as XhrMeta | undefined

      if (meta && !client.isNetworkUrlIgnored(meta.url)) {
        this.addEventListener('loadend', () => {
          if (this.status >= 500) {
            captureNetworkEvent(client, meta.method, meta.url, `HTTP ${this.status}`, `HTTP_${this.status}`)
          } else if (this.status === 0) {
            captureNetworkEvent(client, meta.method, meta.url, 'network failure', 'NetworkError')
          }
        })
      }

      return originalSend.apply(this, args as Parameters<typeof originalSend>)
    }

    teardowns.push(() => {
      XMLHttpRequest.prototype.open = originalOpen
      XMLHttpRequest.prototype.send = originalSend
    })
  }

  return () => {
    for (const teardown of teardowns) {
      teardown()
    }
  }
}

function captureNetworkEvent(client: Client, method: string, url: string, detail: string, code: string): void {
  client.capture({
    level: 'warning',
    kind: 'network',
    message: `Network request failed: ${method} ${url} → ${detail}`,
    code,
  })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase()
  }

  if (typeof input === 'object' && 'method' in input && typeof input.method === 'string') {
    return input.method.toUpperCase()
  }

  return 'GET'
}
