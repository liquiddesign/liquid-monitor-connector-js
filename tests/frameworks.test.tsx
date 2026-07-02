import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { App } from 'vue'
import { flush, init, teardown } from '../src/index'
import { LqdeckErrorBoundary, useLqdeckErrorHandler } from '../src/react'
import { createLqdeckPlugin } from '../src/vue'
import { spyOnTransportFetch, TEST_OPTIONS, type FetchSpy } from './helpers'

describe('framework adapters', () => {
  let fetchSpy: FetchSpy

  beforeEach(() => {
    fetchSpy = spyOnTransportFetch()
    init({ ...TEST_OPTIONS, captureConsole: false, captureNetwork: false })
  })

  afterEach(() => {
    teardown()
    vi.unstubAllGlobals()
  })

  it('LqdeckErrorBoundary reports the error with the component stack and renders the fallback', async () => {
    const boundary = new LqdeckErrorBoundary({
      children: 'content',
      fallback: (error) => `broken: ${error.message}`,
    })

    const error = new Error('render exploded')
    expect(LqdeckErrorBoundary.getDerivedStateFromError(error)).toEqual({ error })

    boundary.componentDidCatch(error, { componentStack: '\n    at App' })
    boundary.state = { error }

    expect(boundary.render()).toBe('broken: render exploded')

    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.kind).toBe('manual')
    expect(event.message).toBe('render exploded')
    expect(event.extra).toEqual({ componentStack: '\n    at App' })
  })

  it('useLqdeckErrorHandler returns a callable reporter', async () => {
    const report = useLqdeckErrorHandler()

    report(new Error('handler error'), { where: 'onClick' })
    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.message).toBe('handler error')
    expect(event.extra).toEqual({ where: 'onClick' })
  })

  it('vue plugin reports component errors and chains an existing errorHandler', async () => {
    const existing = vi.fn()
    const app = { config: { errorHandler: existing } } as unknown as App

    createLqdeckPlugin().install!(app)

    const error = new Error('vue component failed')
    const instance = { $options: { name: 'CheckoutForm' } }

    app.config.errorHandler!(error, instance as never, 'render function')

    expect(existing).toHaveBeenCalledWith(error, instance, 'render function')

    await flush()

    const event = fetchSpy.events()[0]!
    expect(event.message).toBe('vue component failed')
    expect(event.extra).toEqual({ vueInfo: 'render function', component: 'CheckoutForm' })
  })
})
