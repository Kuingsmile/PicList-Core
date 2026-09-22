import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build, watch } from 'rolldown'

const root = fileURLToPath(new URL('../../', import.meta.url))
const temporary = mkdtempSync(path.join(tmpdir(), 'piclist-build-'))
const originalEnv = { NODE_ENV: process.env.NODE_ENV, VERSION: process.env.VERSION }
let watcher
let lastWritten = 'initial build'

/** Writes only into this check's isolated build fixture. */
function write(file, content) {
  lastWritten = file
  const target = path.join(temporary, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

/** Reads a fixture output as text. */
const read = file => readFileSync(path.join(temporary, file), 'utf8')

try {
  for (const file of ['rolldown.config.js', 'scripts', 'package.json', 'tsconfig.json', 'tsconfig.build.json']) {
    cpSync(path.join(root, file), path.join(temporary, file), { recursive: true })
  }
  symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'junction')
  write('src/custom-env.d.ts', readFileSync(path.join(root, 'src/custom-env.d.ts')))
  write(
    'src/index.ts',
    `import { readFileSync } from 'node:fs'
import { pathExistsSync } from 'fs-extra/esm'
import windows from './clipboard.ps1'
import mac from './clipboard.applescript'
import linux from './clipboard.sh'
import metadata from './metadata.json'
export type { Compatibility } from './types'
export type Imported = import('./types').Compatibility
export { value } from './shared'
export const version = process.env.PICGO_VERSION
export const isDev = () => process.env.NODE_ENV === 'development'
export const dependency = pathExistsSync
export const builtin = readFileSync
export const scripts = { windows, mac, linux }
export const label = metadata.label
`,
  )
  write('src/shared.ts', "export const value: string = 'initial'\n")
  write(
    'src/types/index.ts',
    '/** Public type documentation. */\nexport interface Compatibility { original: string }\n',
  )
  write('src/tui/index.tsx', "export { value } from '../shared'\nexport const view = <span>Fixture</span>\n")
  write('src/metadata.json', '{"label":"json fixture"}')
  write('src/clipboard.ps1', 'Write-Output "clipboard"\r\n')
  write('src/clipboard.applescript', 'return "clipboard"\n')
  write('src/clipboard.sh', '#!/bin/sh\necho clipboard\n')
  write('assets/fixture.txt', 'original asset')

  process.env.VERSION = '9.8.7-build-test'
  process.env.NODE_ENV = 'production'
  const configUrl = pathToFileURL(path.join(temporary, 'rolldown.config.js'))
  const { default: production } = await import(`${configUrl}?production`)
  await build({ ...production, logLevel: 'warn' })
  const productionCode = read('dist/index.js')
  const runtime = await import(pathToFileURL(path.join(temporary, 'dist/index.js')))
  assert.equal(runtime.version, process.env.VERSION)
  assert.equal(runtime.label, 'json fixture')
  assert.equal(runtime.value, 'initial')
  assert.equal(typeof runtime.dependency, 'function')
  assert.equal(runtime.builtin, readFileSync)
  assert.equal(runtime.scripts.windows, read('src/clipboard.ps1'))
  assert.equal(runtime.scripts.mac, read('src/clipboard.applescript'))
  assert.equal(runtime.scripts.linux, read('src/clipboard.sh'))
  assert.match(read('dist/index.d.ts'), /from ["']\.\/types\/index\.js["']/)
  assert.match(read('dist/index.d.ts'), /import\(["']\.\/types\/index\.js["']\)/)
  const tui = await import(pathToFileURL(path.join(temporary, 'dist/tui.js')))
  assert.equal(tui.view.type, 'span')
  assert.equal(tui.view.props.children, 'Fixture')
  console.log('Production build: version override, JSX, JSON, scripts, externals, and declarations passed.')

  process.env.NODE_ENV = 'development'
  assert.equal(runtime.isDev(), true)
  process.env.NODE_ENV = 'production'
  assert.equal(runtime.isDev(), false)
  process.env.NODE_ENV = 'development'
  const { default: development } = await import(`${configUrl}?development`)
  watcher = watch({ ...development, logLevel: 'warn' })
  const events = []
  let pending
  let buildError
  watcher.on('event', async event => {
    if (event.code === 'BUNDLE_END' || event.code === 'ERROR') await event.result.close()
    if (event.code === 'ERROR') buildError = event
    if (event.code !== 'END') return
    const completed = buildError || event
    buildError = undefined
    if (pending) pending(completed)
    else events.push(completed)
  })

  /** Waits for a completed write or build failure, with a bounded timeout. */
  function nextBuild() {
    if (events.length) return Promise.resolve(events.shift())
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = undefined
        reject(new Error(`Timed out waiting for a watch rebuild after ${lastWritten}`))
      }, 30000)
      pending = event => {
        clearTimeout(timer)
        pending = undefined
        resolve(event)
      }
    })
  }

  /** Changes one fixture input and checks the resulting watch event. */
  async function rebuild(change, expected = 'END') {
    const next = nextBuild()
    change?.()
    const event = await next
    assert.equal(event.code, expected, event.error?.message)
    return event
  }

  await rebuild()
  console.log('Development watch initialized.')
  assert.ok(read('dist/index.js').length > productionCode.length, 'Development output must remain unminified')
  await rebuild(() => write('src/shared.ts', "export const value: string = 'updated'\n"))
  console.log('Runtime source rebuild passed.')
  const updated = await import(`${pathToFileURL(path.join(temporary, 'dist/index.js'))}?updated`)
  assert.equal(updated.value, 'updated')
  await rebuild(() => write('src/types/index.ts', 'export interface Compatibility { updated: number }\n'))
  console.log('Type-only source rebuild passed.')
  assert.match(read('dist/types/index.d.ts'), /updated: number/)
  await rebuild(() => write('src/types/added.ts', 'export interface Added { value: boolean }\n'))
  console.log('New type-only source rebuild passed.')
  assert.match(read('dist/types/added.d.ts'), /value: boolean/)
  await rebuild(() => write('src/clipboard.ps1', 'Write-Output "updated clipboard"\r\n'))
  console.log('Clipboard script rebuild passed.')
  assert.ok(read('dist/index.js').includes('updated clipboard'))
  await rebuild(() => write('assets/fixture.txt', 'updated asset'))
  console.log('Asset rebuild passed.')
  assert.equal(read('dist/assets/fixture.txt'), 'updated asset')
  console.log('Watch rebuilds: runtime sources, existing/new types, embedded scripts, and assets passed.')

  const validCode = read('dist/index.js')
  const invalid = await rebuild(() => write('src/shared.ts', 'export const value: string = 123\n'), 'ERROR')
  assert.match(invalid.error.message, /TS2322/)
  assert.equal(read('dist/index.js'), validCode, 'Type errors must not overwrite a successful build')
  await rebuild(() => write('src/shared.ts', "export const value: string = 'recovered'\n"))
  const recovered = await import(`${pathToFileURL(path.join(temporary, 'dist/index.js'))}?recovered`)
  assert.equal(recovered.value, 'recovered')

  const tsconfig = JSON.parse(read('tsconfig.json'))
  await rebuild(() => {
    tsconfig.compilerOptions.noUnusedLocals = false
    write('tsconfig.json', JSON.stringify(tsconfig))
  })
  await rebuild(() => write('src/types/added.ts', 'const unused = 1\nexport interface Added { value: boolean }\n'))
  console.log('Watch rebuilds: type-error rejection/recovery and extended tsconfig changes passed.')
  await watcher.close()
  watcher = undefined

  write('src/missing.js', "export { value } from 'piclist-unresolved-build-fixture'\n")
  await assert.rejects(
    build({ ...production, input: path.join(temporary, 'src/missing.js'), logLevel: 'warn' }),
    /piclist-unresolved-build-fixture/,
  )
  console.log('Unresolved imports correctly fail the build. All build checks passed.')
} finally {
  await watcher?.close()
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  assert.equal(path.dirname(temporary), path.resolve(tmpdir()))
  assert.ok(path.basename(temporary).startsWith('piclist-build-'))
  rmSync(temporary, { recursive: true, force: true })
}
