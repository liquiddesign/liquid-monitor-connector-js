import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../src/client'
import {
  createOriginOwnJsPattern,
  createOwnCodeOnlyBeforeSend,
  eventTouchesOwnJsBundle,
  escapeOriginForRegExp,
} from '../src/filters/ownCodeOnly'
import { TEST_OPTIONS } from './helpers'
import type { LqdeckEvent } from '../src/types'

const event = (overrides: Partial<LqdeckEvent> = {}): LqdeckEvent => ({
  level: 'error',
  message: 'boom',
  kind: 'uncaught',
  ...overrides,
})

describe('ownCodeOnly filter', () => {
  it('escapes dots in the origin for RegExp construction', () => {
    expect(escapeOriginForRegExp('https://www.example.co.uk')).toBe('https://www\\.example\\.co\\.uk')
  })

  it('matches external js bundles on the origin', () => {
    const origin = 'https://www.rajtiskaren.cz'
    const pattern = createOriginOwnJsPattern(origin)

    expect(pattern.test('at run (https://www.rajtiskaren.cz/assets/app.abc123.js:1:1)')).toBe(true)
    expect(pattern.test('https://www.rajtiskaren.cz/produkt')).toBe(false)
    expect(pattern.test('https://app.prijmout-cookies.cz/static/cc/2.8/cookieconsent.js:25:308')).toBe(false)
  })

  it('keeps bundle errors and drops inline document-url errors', () => {
    const origin = 'https://www.rajtiskaren.cz'

    expect(
      eventTouchesOwnJsBundle(
        event({
          stack: 'ReferenceError: x\n    at run (https://www.rajtiskaren.cz/assets/main.js:10:2)',
        }),
        origin,
      ),
    ).toBe(true)

    expect(
      eventTouchesOwnJsBundle(
        event({
          stack: 'ReferenceError: x\n    at log (https://www.rajtiskaren.cz/produkt:2:252)',
          source: { file: 'https://www.rajtiskaren.cz/produkt', line: 2 },
        }),
        origin,
      ),
    ).toBe(false)
  })

  it('createOwnCodeOnlyBeforeSend drops non-bundle events', () => {
    const filter = createOwnCodeOnlyBeforeSend('https://shop.test')

    expect(
      filter(
        event({
          stack: 'Error: x\n    at a (https://shop.test/build/app.js:1:1)',
        }),
      ),
    ).toEqual(
      event({
        stack: 'Error: x\n    at a (https://shop.test/build/app.js:1:1)',
      }),
    )

    expect(
      filter(
        event({
          source: { file: 'https://shop.test/checkout', line: 4 },
        }),
      ),
    ).toBeNull()
  })
})

describe('Client ownCodeOnly', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops inline third-party-style errors when ownCodeOnly is enabled', () => {
    vi.stubGlobal('location', { origin: 'https://www.rajtiskaren.cz', href: 'https://www.rajtiskaren.cz/produkt' })

    const client = new Client({ ...TEST_OPTIONS, ownCodeOnly: true })

    expect(
      client.capture({
        level: 'error',
        kind: 'uncaught',
        message: 'ReferenceError: ma',
        stack: 'ReferenceError: ma\n    at log (https://www.rajtiskaren.cz/produkt:2:252)',
        source: { file: 'https://www.rajtiskaren.cz/produkt', line: 2 },
      }),
    ).toBe(false)

    expect(
      client.capture({
        level: 'error',
        kind: 'uncaught',
        message: 'TypeError: broken bundle',
        stack: 'TypeError: broken bundle\n    at run (https://www.rajtiskaren.cz/assets/app.js:99:1)',
        source: { file: 'https://www.rajtiskaren.cz/assets/app.js', line: 99 },
      }),
    ).toBe(true)
  })

  it('runs ownCodeOnly before a custom beforeSend hook', () => {
    vi.stubGlobal('location', { origin: 'https://monitor.test', href: 'https://monitor.test/page' })

    const client = new Client({
      ...TEST_OPTIONS,
      ownCodeOnly: true,
      beforeSend: (captured) => ({ ...captured, extra: { tagged: true } }),
    })

    expect(
      client.capture({
        level: 'error',
        kind: 'uncaught',
        message: 'inline',
        source: { file: 'https://monitor.test/page', line: 1 },
      }),
    ).toBe(false)

    expect(
      client.capture({
        level: 'error',
        kind: 'uncaught',
        message: 'bundle',
        stack: 'Error: bundle\n    at run (https://monitor.test/app.js:1:1)',
      }),
    ).toBe(true)
  })
})
