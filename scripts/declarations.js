import path from 'node:path'

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

/** Keeps TypeScript's declaration layout and diagnostics while Rolldown handles JavaScript. */
export function declarations(tsconfig) {
  return {
    name: 'typescript-declarations',
    /** Type-checks every source file and emits declarations on initial builds and watch rebuilds. */
    buildStart() {
      const watchFile = file => this.addWatchFile(file.split(path.sep).join('/'))
      watchFile(tsconfig)
      const diagnostics = []
      const config = ts.getParsedCommandLineOfConfigFile(
        tsconfig,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: diagnostic => diagnostics.push(diagnostic),
        },
      )
      if (config) diagnostics.push(...config.errors)
      const formatHost = {
        getCanonicalFileName: file => file,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      }
      if (diagnostics.length) this.error(ts.formatDiagnostics(diagnostics, formatHost))

      const program = ts.createProgram(config.fileNames, config.options)
      for (const source of program.getSourceFiles()) {
        if (!program.isSourceFileFromExternalLibrary(source) && !program.isSourceFileDefaultLibrary(source)) {
          watchFile(source.fileName)
          watchFile(path.dirname(source.fileName))
        }
      }
      // Extended configs affect both diagnostics and the emitted public type surface.
      for (const extended of config.options.configFile?.extendedSourceFiles || []) watchFile(extended)

      const errors = ts.getPreEmitDiagnostics(program)
      if (errors.length) this.error(ts.formatDiagnostics(errors, formatHost))
      let emitted = 0
      const result = program.emit(
        undefined,
        (file, source) => {
          emitted++
          this.emitFile({
            type: 'asset',
            fileName: path.relative(config.options.outDir, file).split(path.sep).join('/'),
            source,
          })
        },
        undefined,
        true,
        { afterDeclarations: [nodeDeclarationImports] },
      )
      // TypeScript sets emitSkipped for JSON inputs even when all declarations were emitted.
      if (!emitted || result.diagnostics.length) {
        this.error(ts.formatDiagnostics(result.diagnostics, formatHost) || 'Declaration emit failed')
      }
    },
  }
}
