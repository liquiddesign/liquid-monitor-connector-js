/**
 * Standalone browser bundle entry (dist/lqdeck-connector.min.js, global
 * `LqdeckMonitor`). Served from the monitor for plain <script> usage.
 *
 * Auto-initializes from the script tag's data attributes:
 *
 *   <script src="https://monitor.example/js/lqdeck-connector.min.js"
 *           data-url="https://monitor.example/api/browser"
 *           data-key="jsk_..." defer></script>
 *
 * Optional attributes: data-sample-rate, data-capture-console="false",
 * data-capture-network="false", data-max-errors-per-page, data-own-code-only="true".
 */
import { init } from './index'

export * from './index'

const script = typeof document !== 'undefined' ? document.currentScript : null

if (script instanceof HTMLScriptElement && script.dataset.url && script.dataset.key) {
  init({
    url: script.dataset.url,
    key: script.dataset.key,
    ...(script.dataset.sampleRate !== undefined ? { sampleRate: Number(script.dataset.sampleRate) } : {}),
    ...(script.dataset.maxErrorsPerPage !== undefined
      ? { maxErrorsPerPage: Number(script.dataset.maxErrorsPerPage) }
      : {}),
    captureConsole: script.dataset.captureConsole !== 'false',
    captureNetwork: script.dataset.captureNetwork !== 'false',
    ...(script.dataset.ownCodeOnly === 'true' ? { ownCodeOnly: true } : {}),
  })
}
