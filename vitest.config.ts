import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'script-as-string',
      enforce: 'pre',
      /** Exposes bundled clipboard scripts as string modules when testing source imports. */
      transform(code, id) {
        if (!/\.(?:applescript|ps1|sh)$/.test(id)) return null
        return { code: `export default ${JSON.stringify(code)}`, map: null }
      },
    },
  ],
  resolve: {
    alias: {
      '../dist/index.js': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },
  test: {
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/**', 'src/custom-env.d.ts'],
      reporter: ['text', 'lcov'],
    },
    testTimeout: 10000,
  },
})
