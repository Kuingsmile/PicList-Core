import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import { defineConfig } from 'rollup'
import copy from 'rollup-plugin-copy'
import { string } from 'rollup-plugin-string'
import ts from 'typescript'

// Bundler resolution accepts extensionless source imports, but NodeNext consumers
// need explicit file names in declarations (including index.js for directories).
/** Rewrites relative declaration imports to explicit runtime filenames for NodeNext consumers. */
function nodeDeclarationImports(context) {
  return source => {
    /**
     * Resolves a relative source module and replaces its declaration specifier with the emitted
     * runtime path.
     */
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

    /**
     * Rewrites import/export specifiers and import-type references throughout an emitted declaration
     * tree.
     */
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

const fromRoot = file => path.resolve(import.meta.dirname, file)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
/**
 * Package boundaries that remain external to the bundle, including all declared runtime dependency
 * classes.
 */
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
  // Match package boundaries so e.g. `react-dom` is not mistaken for `react`.
  external: id => isBuiltin(id) || externalPackages.some(name => id === name || id.startsWith(`${name}/`)),
  /** Fails the build on unresolved imports while forwarding other Rollup warnings. */
  onwarn(warning, warn) {
    // Undeclared dependencies must not silently become runtime imports.
    if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message)
    warn(warning)
  },
  plugins: [
    typescript({
      tsconfig: fromRoot('tsconfig.build.json'),
      transformers: { afterDeclarations: [nodeDeclarationImports] },
    }),
    string({
      include: /\.(applescript|ps1|sh)$/,
    }),
    json(),
    replace({
      'process.env.PICGO_VERSION': JSON.stringify(version),
      preventAssignment: true,
    }),
    commonjs(),
    copy({
      hook: 'writeBundle',
      targets: [{ src: fromRoot('assets').split(path.sep).join('/'), dest: fromRoot('dist') }],
    }),
  ],
  output: {
    dir: fromRoot('dist'),
    entryFileNames: '[name].js',
    format: 'esm',
    banner,
    sourcemap: true,
    plugins: [
      !isDev &&
        terser({
          format: {
            comments: /piclist@/i,
          },
        }),
    ],
  },
})
