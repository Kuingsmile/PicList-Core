import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import { dts } from 'rollup-plugin-dts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

const builtinModules = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'vm',
  'zlib',
  'fs/promises',
  'stream/promises',
  'timers/promises',
  'util/types',
  'worker_threads',
  'perf_hooks',
  'async_hooks',
  'inspector',
  'trace_events',
  'v8'
]

const externalPackages = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  ...builtinModules
].map(packageName => new RegExp(`^${packageName}(/.*)?`))

const external = [
  ...externalPackages,
  './src/utils/clipboard/windows.ps1',
  './src/utils/clipboard/linux.sh',
  './src/utils/clipboard/mac.applescript',
  './src/utils/clipboard/windows10.ps1',
  './src/utils/clipboard/wsl.sh'
]


const version = process.env.VERSION || pkg.version
const sourcemap = 'inline'
const banner = `/*
 * piclist@${version}, https://github.com/Kuingsmile/PicList-Core
 * (c) 2022-${new Date().getFullYear()} Kuingsmile
 * Released under the MIT License.
 */`

export default defineConfig( [
  {
    input: './src/index.ts',
  // Creating regex of the packages to make sure sub-paths of the
  // packages such as `lowdb/adapters/FileSync` are also treated as external
  external,
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node']
    }),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: true,
      inlineSources: true,
      declaration: true,
      declarationDir: 'dist',
      rootDir: 'src'
    }),
    commonjs(),
    json(),
    copy({
      targets: [
        { src: 'assets', dest: 'dist' },
        { src: 'src/utils/clipboard/*', dest: 'dist/utils/clipboard' },
      ]
    }),
    replace({
      'process.env.PICGO_VERSION': JSON.stringify(pkg.version),
      preventAssignment: true
    })
  ],
    output: {
      file: 'dist/index.js',
      format: 'esm',
      banner,
      sourcemap
    }
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm'
    },
    external,
    plugins: [
      dts({
        tsconfig: './tsconfig.json'
      })
    ]
  }
])