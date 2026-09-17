import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import copy from 'rollup-plugin-copy'
import { string } from 'rollup-plugin-string'
import ts from 'typescript'

// Bundler resolution accepts extensionless source imports, but NodeNext consumers
// need explicit file names in declarations (including index.js for directories).
function nodeDeclarationImports(context) {
  return source => {
    function resolveSpecifier(node) {
      if (!ts.isStringLiteral(node) || !/^\.{1,2}\//.test(node.text)) return node

      const { resolvedModule } = ts.resolveModuleName(node.text, source.fileName, context.getCompilerOptions(), ts.sys)
      if (!resolvedModule) {
        throw new Error(`Cannot resolve declaration import ${node.text} in ${source.fileName}`)
      }
      const target = resolvedModule.resolvedFileName
        .replace(/(?:\.d)?\.mts$/, '.mjs')
        .replace(/(?:\.d)?\.cts$/, '.cjs')
        .replace(/(?:\.d)?\.tsx?$/, '.js')
      const relative = path.relative(path.dirname(source.fileName), target).split(path.sep).join('/')
      return context.factory.createStringLiteral(relative.startsWith('.') ? relative : `./${relative}`)
    }

    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        return ts.visitEachChild(
          node,
          child => (child === node.moduleSpecifier ? resolveSpecifier(child) : visit(child)),
          context,
        )
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        return ts.visitEachChild(
          node,
          child =>
            child === node.argument
              ? context.factory.updateLiteralTypeNode(node.argument, resolveSpecifier(node.argument.literal))
              : visit(child),
          context,
        )
      }
      return ts.visitEachChild(node, visit, context)
    }

    return ts.visitNode(source, visit)
  }
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const version = process.env.VERSION || pkg.version
const sourcemap = true
const banner = `/*
 * piclist@${version}, https://github.com/Kuingsmile/PicList-Core
 * (c) 2022-${new Date().getFullYear()} Kuingsmile
 * Released under the MIT License.
 */`
const input = { index: './src/index.ts', tui: './src/tui/index.tsx' }

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
      tsconfig: './tsconfig.build.json',
      transformers: { afterDeclarations: [nodeDeclarationImports] },
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
      dir: 'dist',
      entryFileNames: '[name].js',
      format: 'esm',
      banner,
      sourcemap,
    },
  ],
  ...commonOptions,
}

export default [nodeEsm]
