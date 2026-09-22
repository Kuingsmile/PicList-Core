import { readdirSync, readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'

import { defineConfig } from 'rolldown'

import { declarations } from './scripts/declarations.js'

const fromRoot = file => path.resolve(import.meta.dirname, file)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const externalPackages = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })
const version = process.env.VERSION || pkg.version
const isDev = process.env.NODE_ENV === 'development'
const banner = `/*
 * piclist@${version}, https://github.com/Kuingsmile/PicList-Core
 * (c) 2022-${new Date().getFullYear()} Kuingsmile
 * Released under the MIT License.
 */`

export default defineConfig({
  input: { index: fromRoot('src/index.ts'), tui: fromRoot('src/tui/index.tsx') },
  platform: 'node',
  tsconfig: fromRoot('tsconfig.build.json'),
  preserveEntrySignatures: 'strict',
  // Type checking intentionally accounts for most of the build time.
  checks: { pluginTimings: false },
  // Rolldown 1.2's native watcher matches exact paths. Poll directory changes as well
  // so newly added declaration-only files trigger a rebuild.
  watch: { watcher: { usePolling: true, compareContentsForPolling: true } },
  // Match package boundaries so e.g. `react-dom` is not mistaken for `react`.
  external: id => isBuiltin(id) || externalPackages.some(name => id === name || id.startsWith(`${name}/`)),
  /** Fails the build on unresolved imports instead of silently adding runtime dependencies. */
  onwarn(warning, warn) {
    if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message)
    warn(warning)
  },
  transform: {
    target: 'es2022',
    define: { 'process.env.PICGO_VERSION': JSON.stringify(version) },
  },
  plugins: [
    declarations(fromRoot('tsconfig.build.json')),
    {
      name: 'clipboard-scripts',
      load: {
        filter: { id: /\.(applescript|ps1|sh)$/ },
        /** Tracks clipboard scripts explicitly so watch rebuilds also refresh their embedded text. */
        handler(id) {
          // Normalize watch paths to match Rolldown's Windows event normalization.
          this.addWatchFile(id.split(path.sep).join('/'))
          return { code: `export default ${JSON.stringify(readFileSync(id, 'utf8'))}`, map: { mappings: '' } }
        },
      },
    },
    {
      name: 'package-assets',
      /** Includes runtime assets beside the entry points and refreshes them in watch mode. */
      buildStart() {
        const directory = fromRoot('assets')
        this.addWatchFile(directory.split(path.sep).join('/'))
        for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
          if (!file.isFile()) continue
          const source = path.join(file.parentPath, file.name)
          this.addWatchFile(source.split(path.sep).join('/'))
          this.emitFile({
            type: 'asset',
            fileName: `assets/${path.relative(directory, source).split(path.sep).join('/')}`,
            source: readFileSync(source),
          })
        }
      },
    },
  ],
  output: {
    dir: fromRoot('dist'),
    entryFileNames: '[name].js',
    format: 'esm',
    // Add the license after minification so comment removal cannot discard it.
    postBanner: banner,
    sourcemap: true,
    minify: !isDev,
    comments: isDev,
  },
})
