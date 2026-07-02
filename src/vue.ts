import type { App, Plugin } from 'vue'
import { captureError } from './index'

/**
 * Vue 3 plugin: hooks app.config.errorHandler and reports component errors
 * to LQDeck. A previously registered handler keeps running after ours.
 *
 *   app.use(createLqdeckPlugin())
 */
export function createLqdeckPlugin(): Plugin {
  return {
    install(app: App): void {
      const existing = app.config.errorHandler

      app.config.errorHandler = (err, instance, info) => {
        captureError(err, {
          vueInfo: info,
          component: componentName(instance),
        })

        if (typeof existing === 'function') {
          existing(err, instance, info)
        }
      }
    },
  }
}

function componentName(instance: unknown): string | undefined {
  if (instance && typeof instance === 'object' && '$options' in instance) {
    const options = (instance as { $options?: { name?: string; __name?: string } }).$options

    return options?.name ?? options?.__name
  }

  return undefined
}
