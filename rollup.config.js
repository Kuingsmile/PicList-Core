import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import copy from 'rollup-plugin-copy'
import { string } from 'rollup-plugin-string'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const version = process.env.VERSION || pkg.version
const sourcemap = true
const banner = `/*
 * piclist@${version}, https://github.com/Kuingsmile/PicList-Core
 * (c) 2022-${new Date().getFullYear()} Kuingsmile
 * Released under the MIT License.
 */`
const input = './src/index.ts'

const commonOptions = {
  // Creating regex of the packages to make sure sub-paths of the
  // packages such as `lowdb/adapters/FileSync` are also treated as external
  // See https://github.com/rollup/rollup/issues/3684#issuecomment-926558056
  external: [
    ...Object.keys(pkg.dependencies).map(packageName => new RegExp(`^${packageName}(/.*)?`)),
    ...builtinModules.map(moduleName => new RegExp(`^(node:)?${moduleName}(/.*)?`)),
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
    copy({
      targets: [{ src: 'assets', dest: 'dist' }],
    }),
    // terser(),
    commonjs(),
    string({
      // Required to be specified
      include: ['**/*.applescript', '**/*.ps1', '**/*.sh'],
    }),
    json(),
    replace({
      'process.env.PICGO_VERSION': JSON.stringify(pkg.version),
      preventAssignment: true,
    }),
  ],
  input,
}

const isDev = process.env.NODE_ENV === 'development'

if (!isDev) {
  commonOptions.plugins.push(
    terser({
      format: {
        comments: /piclist@/i,
      },
    }),
  )
}

/** @type import('rollup').RollupOptions */

const nodeEsm = {
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      banner,
      sourcemap,
    },
  ],
  ...commonOptions,
}

export default [nodeEsm]
