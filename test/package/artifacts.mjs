import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'

import ts from 'typescript'

/** Verifies the published build's files, external dependencies, maps, and embedded clipboard scripts. */
export function checkArtifacts(root, installed, files) {
  const pkg = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })
  const dist = path.join(installed, 'dist')
  const literals = new Set()

  for (const { path: file } of files) {
    assert.ok(!/^(?:scripts\/|(?:rollup|rolldown)\.config\.)/.test(file), `Build tooling leaked into package: ${file}`)
  }
  for (const file of readdirSync(path.join(root, 'src'), { recursive: true })) {
    if (/\.tsx?$/.test(file) && !file.endsWith('.d.ts')) {
      assert.ok(statSync(path.join(dist, file.replace(/\.tsx?$/, '.d.ts'))).isFile(), `Missing declaration for ${file}`)
    }
  }
  for (const file of readdirSync(path.join(root, 'assets'), { recursive: true })) {
    if (!statSync(path.join(root, 'assets', file)).isFile()) continue
    assert.deepEqual(readFileSync(path.join(dist, 'assets', file)), readFileSync(path.join(root, 'assets', file)))
  }

  for (const file of readdirSync(dist).filter(file => file.endsWith('.js'))) {
    const code = readFileSync(path.join(dist, file), 'utf8')
    assert.ok(code.includes(`piclist@${pkg.version}`), `Missing license/version banner: ${file}`)
    assert.ok(code.includes(`sourceMappingURL=${file}.map`), `Missing source map link: ${file}`)
    assert.ok(!code.includes('process.env.PICGO_VERSION'), `Unreplaced package version: ${file}`)
    const map = JSON.parse(readFileSync(path.join(dist, `${file}.map`), 'utf8'))
    assert.equal(map.version, 3)
    assert.ok(map.mappings.length > 0)
    assert.ok(
      map.sources.some(source => /\.tsx?$/.test(source)),
      `Missing original TypeScript sources: ${file}`,
    )
    assert.equal(map.sourcesContent.length, map.sources.length)

    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    /** Collects embedded script text and verifies that generated imports keep package boundaries. */
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text)
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const id = node.moduleSpecifier.text
        if (id.startsWith('.')) {
          assert.ok(statSync(path.resolve(dist, id)).isFile(), `Missing runtime chunk: ${id}`)
        } else {
          assert.ok(
            isBuiltin(id) || dependencies.some(name => id === name || id.startsWith(`${name}/`)),
            `Undeclared runtime dependency: ${id}`,
          )
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  for (const file of readdirSync(path.join(root, 'src/utils/clipboard'))) {
    const content = readFileSync(path.join(root, 'src/utils/clipboard', file), 'utf8')
    assert.ok(literals.has(content), `Clipboard script content changed: ${file}`)
  }
}
