import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import spawn from 'cross-spawn'

import { checkArtifacts } from './artifacts.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
/** Dedicated package-consumer sandbox owned by this check and removed in its final cleanup. */
const temporary = mkdtempSync(path.join(tmpdir(), 'piclist-package-'))
const consumer = path.join(temporary, 'consumer')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

/**
 * Runs npm with captured stdout and inherited stderr, asserting successful completion before returning
 * output.
 */
function runNpm(args, cwd) {
  const result = spawn.sync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stdout)
  return result.stdout
}

try {
  console.log('Packing piclist and installing it in an isolated consumer project...')
  const packed = JSON.parse(runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root))
  const tarball = path.join(temporary, packed[0].filename)
  cpSync(new URL('./consumer/', import.meta.url), consumer, { recursive: true })
  const manifestPath = path.join(consumer, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies = { [pkg.name]: pathToFileURL(tarball).href }
  manifest.devDependencies = {
    typescript: pkg.devDependencies.typescript,
    '@types/node': pkg.devDependencies['@types/node'],
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], consumer)

  const installed = path.join(consumer, 'node_modules', pkg.name)
  assert.equal(realpathSync(installed), installed, 'The consumer must use the tarball, not a workspace link')
  const installedPackage = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  assert.equal(installedPackage.exports, undefined, 'Do not restrict existing package subpaths')
  console.log('Checking packaged declarations, assets, source maps, and clipboard scripts...')
  checkArtifacts(root, installed, packed[0].files)

  const tsc = path.join(consumer, 'node_modules/typescript/bin/tsc')
  console.log('Checking NodeNext declarations with skipLibCheck disabled...')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: consumer, stdio: 'inherit' })
  console.log('Checking legacy Bundler import paths...')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.bundler.json'], { cwd: consumer, stdio: 'inherit' })
  console.log('Checking runtime exports and existing package subpaths...')
  execFileSync(process.execPath, ['runtime.mjs'], { cwd: consumer, stdio: 'inherit' })
  console.log('Packed package consumer checks passed.')
} finally {
  // Only remove the dedicated directory created by mkdtemp above.
  rmSync(temporary, { recursive: true, force: true })
}
