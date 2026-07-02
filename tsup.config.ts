import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// src/version.ts is generated from package.json so the reported
// connectorVersion can never drift from the published version.
writeFileSync(
  new URL('./src/version.ts', import.meta.url),
  `// Generated from package.json by tsup.config.ts — do not edit.\nexport const VERSION = '${pkg.version}'\n`,
)

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      react: 'src/react.tsx',
      vue: 'src/vue.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'vue'],
  },
  {
    // Standalone browser build served from the monitor for <script> usage.
    // The IIFE entry auto-inits from the script tag's data attributes.
    entry: { 'lqdeck-connector': 'src/iife.ts' },
    format: ['iife'],
    globalName: 'LqdeckMonitor',
    minify: true,
    sourcemap: false,
    outExtension: () => ({ js: '.min.js' }),
  },
])
