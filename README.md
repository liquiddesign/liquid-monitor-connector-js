# liquid-monitor-connector-js

Browser error reporting connector for **LQDeck** (Liquid Monitor). Captures JavaScript errors in visitors' browsers and reports them to the monitor, where they appear in the project's errors UI next to server-side errors.

Captures:

- uncaught exceptions (`window.onerror`)
- unhandled promise rejections
- `console.error` calls (optional, default on)
- failed network requests — fetch/XHR 5xx responses and network failures (optional, default on, reported as *weak* warnings)
- manual reports via `captureError()` / `captureMessage()`

## Installation

### `<script>` tag (any website)

The ready-made snippet (with the project's key filled in) is available in the LQDeck admin on the project's **JS connector** tab. The bundle is served by the monitor itself:

```html
<script src="https://<monitor>/js/lqdeck-connector.min.js"
        data-url="https://<monitor>/api/browser"
        data-key="jsk_..." defer></script>
```

The script initializes itself from the `data-*` attributes. Optional attributes: `data-sample-rate`, `data-max-errors-per-page`, `data-capture-console="false"`, `data-capture-network="false"`, `data-own-code-only="true"`.

On sites with heavy third-party script noise (cookie consent, GTM, trackers), add `data-own-code-only="true"` and consider `data-capture-network="false"` — see [Filtering noise / own code only](#filtering-noise--own-code-only) below.

### npm package (bundlers, React, Vue)

```bash
npm install @liquiddesign/liquid-monitor-connector-js
```

```ts
import { init } from '@liquiddesign/liquid-monitor-connector-js'

init({
    url: 'https://<monitor>/api/browser',
    key: 'jsk_...',
})
```

Call `init()` as early as possible (before your app boots), so handlers are installed before the first error.

## Configuration

```ts
init({
    url: 'https://<monitor>/api/browser', // required — base browser API URL of the monitor
    key: 'jsk_...',                       // required — public project key from LQDeck
    enabled: true,                        // master switch (e.g. disable in development)
    sampleRate: 1,                        // fraction of events to send (0–1)
    maxErrorsPerPage: 20,                 // hard cap per page load
    dedupeWindowMs: 30_000,               // identical errors within the window are sent once
    ignoreErrors: ['ResizeObserver loop', /^Script error/],
    captureConsole: true,                 // report console.error calls
    captureNetwork: true,                 // report fetch/XHR 5xx + network failures
    networkIgnoreUrls: [/analytics\./],   // never report these request URLs
    ownCodeOnly: false,                   // only errors from .js bundles on page origin
    beforeSend: (event) => event,         // mutate or drop (return null) events
    identity: { userId: 42 },             // attached to every event
})
```

Other exports:

```ts
captureError(err, extra?)             // report a caught error
captureMessage(message, level?, extra?)
setIdentity(identity | null)
flush(): Promise<void>                // send the queue now
teardown()                            // uninstall all handlers (SPA teardown, tests)
```

### React

```tsx
import { LqdeckErrorBoundary, useLqdeckErrorHandler } from '@liquiddesign/liquid-monitor-connector-js/react'

<LqdeckErrorBoundary fallback={(error) => <Crashed error={error} />}>
    <App />
</LqdeckErrorBoundary>

// in event handlers / effects (error boundaries do not see those):
const report = useLqdeckErrorHandler()
report(error, { where: 'checkout submit' })
```

### Vue 3

```ts
import { createLqdeckPlugin } from '@liquiddesign/liquid-monitor-connector-js/vue'

app.use(createLqdeckPlugin())
```

## Filtering noise / own code only

On production e-shops and marketing sites the connector captures **all** JavaScript errors by default — including massive noise from third-party scripts (cookie consent, GTM, Leadhub, ad blockers, etc.).

### Why origin-based filtering fails

Browsers attribute **inline** scripts — including scripts injected and executed by third-party libraries after consent — to the **document URL**, not the vendor's domain. Both `source.file` and the top stack frames therefore show your origin even for foreign tracking pixels. A naive filter like “pass when stack or source contains `location.origin`” lets these through: your origin alone cannot distinguish your inline glue from a third-party inline pixel.

Example (production): cookie-consent runs a callback that injects an inline tracking script; the error surfaces as `source.file: https://www.example.com/product` with stack frames on that same document URL, while the real culprit is `cookieconsent.js` on another host deeper in the stack.

### Built-in: `ownCodeOnly` (recommended)

Set `ownCodeOnly: true` (or `data-own-code-only="true"` on the script tag) to report only errors whose **stack or `source.file` references an external `.js` file on the page origin** — typically your webpack/Vite bundles. Inline scripts (document URL without `.js`) are dropped.

```html
<script src="https://<monitor>/js/lqdeck-connector.min.js"
        data-url="https://<monitor>/api/browser"
        data-key="jsk_..."
        data-own-code-only="true"
        data-capture-network="false" defer></script>
```

```ts
init({
    url: 'https://<monitor>/api/browser',
    key: 'jsk_...',
    ownCodeOnly: true,
    captureNetwork: false, // failed requests are mostly ad blockers / third-party trackers
})
```

**Trade-off:** this whitelist also drops errors from **your own** inline glue in templates (e.g. `dataLayer.push` snippets), because those are inline too. For many shops that is acceptable — inline glue is mostly analytics. If you rely on catching inline template bugs, use the blocklist approach below or a custom `beforeSend`.

Helpers are exported if you want to compose manually: `createOwnCodeOnlyBeforeSend`, `eventTouchesOwnJsBundle`, `createOriginOwnJsPattern`.

### Manual `beforeSend` recipe (full control)

`beforeSend` requires calling `init()` yourself (the script tag cannot set it). Equivalent to `ownCodeOnly`:

```js
LqdeckMonitor.init({
    url: 'https://<monitor>/api/browser',
    key: 'jsk_...',
    captureNetwork: false,
    beforeSend: function (e) {
        var origin = location.origin.split('.').join('\\.');
        var ourJs = new RegExp(origin + '[^\\s]*\\.js');
        var hit = function (s) { return typeof s === 'string' && ourJs.test(s); };
        return hit(e.stack) || (e.source && hit(e.source.file)) ? e : null;
    },
});
```

**Latte / template engines:** write the snippet so it does not contain `{` immediately followed by `$` (Latte `{$var}` collision) and avoid nested quote collisions inside `<script>`. Escaping the origin via `split('.').join('\\.')` avoids regex literals with `{}`.

### Alternative: third-party domain blocklist

Keeps your inline template glue, but requires maintaining a list of vendor domains:

```js
beforeSend: function (e) {
    var blocked = [
        'prijmout-cookies.cz',
        'googletagmanager.com',
        'leadhub.co',
    ];
    var haystack = (e.stack || '') + ' ' + (e.source && e.source.file || '');
    for (var i = 0; i < blocked.length; i++) {
        if (haystack.indexOf(blocked[i]) !== -1) {
            return null;
        }
    }
    return e;
}
```

## How it talks to the monitor

Events are batched (max 20 per request) and POSTed to `<url>/log` as JSON with `Content-Type: text/plain` — a CORS *simple request*, so no preflight is needed and the same payload works through `navigator.sendBeacon` on `pagehide`. The `jsk_` key is **public by design**: it only authorizes error ingestion, never reads. Flood protection is layered on both sides (client dedup + per-page cap, server throttle + hourly cap).

## Development

```bash
npm install
npm test          # vitest (happy-dom)
npm run typecheck
npm run build     # tsup → dist/ (ESM + CJS + IIFE)
```

`src/version.ts` is regenerated from `package.json` on every build, so the reported `connectorVersion` cannot drift.

## Release of the browser bundle

The monitor serves the IIFE build from its own `public/js/`. After a version bump + build here, copy the artifact into the backend repo and commit it there:

```bash
npm run build
cp dist/lqdeck-connector.min.js ../liquid-monitor-back/public/js/lqdeck-connector.min.js
cp dist/lqdeck-connector.min.js ../liquid-monitor-back/public/js/lqdeck-connector-<major>.min.js
```

The versioned copy (`lqdeck-connector-1.min.js`) lets client sites pin a major while `lqdeck-connector.min.js` tracks the latest.
