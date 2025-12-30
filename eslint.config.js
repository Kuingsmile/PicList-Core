import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import configPrettier from 'eslint-config-prettier'
import jsonc from 'eslint-plugin-jsonc'
import pluginPrettier from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import jsoncParser from 'jsonc-eslint-parser'
import tseslint from 'typescript-eslint'
export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'vitest.workspace.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: [
      'src/**/*.{ts,tsx,cts,mts,js,cjs,mjs}',
      'scripts/**/*.{ts,js,mjs}',
      'test/**/*.{ts,js,mjs}',
      './bin/picgo',
      './bin/picgo-server',
      'eslint.config.js',
      'rollup.config.js',
    ],
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
      globals: globals.node,
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-module': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      eqeqeq: 'error',
      'no-caller': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-undef-init': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      'unicode-bom': ['error', 'never'],
      'no-console': 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-unused-vars': 'off',
      'no-extra-boolean-cast': 'off',
      'no-case-declarations': 'off',
      'no-cond-assign': 'off',
      'no-control-regex': 'off',
      'no-inner-declarations': 'off',
      'no-empty': 'off',
      // @typescript-eslint/eslint-plugin
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off', // {} is a totally useful and valid type.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      // Pending https://github.com/typescript-eslint/typescript-eslint/issues/4820
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  ...jsonc.configs['flat/recommended-with-jsonc'],
  {
    files: ['**/*.json', '**/*.jsonc', '**/*.json5'],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      'jsonc/array-bracket-spacing': ['error', 'never'],
      'jsonc/comma-dangle': ['error', 'never'],
      'jsonc/indent': ['error', 2],
      'jsonc/no-comments': 'off',
      'jsonc/quotes': ['error', 'double'],
    },
  },
  {
    files: ['src/i18n/**/*.json'],
    rules: {
      'jsonc/sort-keys': [
        'error',
        'asc', // 升序排列
        {
          caseSensitive: false,
          natural: true,
        },
      ],
    },
  },
  {
    files: ['**/*.mjs', '**/*.mts'],
    rules: {
      // These globals don't exist outside of CJS files.
      'no-restricted-globals': [
        'error',
        { name: '__filename' },
        { name: '__dirname' },
        { name: 'require' },
        { name: 'module' },
        { name: 'exports' },
      ],
    },
  },
  configPrettier,
  pluginPrettier,
)
