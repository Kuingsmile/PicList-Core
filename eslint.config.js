import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import jsonc from 'eslint-plugin-jsonc'
import pluginPrettier from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const jsoncFiles = ['**/*.jsonc', '**/tsconfig.json', '**/tsconfig.*.json', '**/.vscode/*.json']

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  {
    files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}', 'bin/picgo', 'bin/picgo-server'],
    extends: [js.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
    languageOptions: {
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
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-extra-boolean-cast': 'off',
      'no-case-declarations': 'off',
      'no-cond-assign': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      // @typescript-eslint/eslint-plugin
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off', // {} is a totally useful and valid type.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.{cjs,cts}'],
    languageOptions: {
      sourceType: 'commonjs',
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
  {
    files: ['**/*.json'],
    ignores: jsoncFiles,
    extends: [jsonc.configs['recommended-with-json'], jsonc.configs.prettier],
    language: 'jsonc/json',
  },
  {
    files: jsoncFiles,
    extends: [jsonc.configs['recommended-with-jsonc'], jsonc.configs.prettier],
    language: 'jsonc/jsonc',
  },
  {
    files: ['**/*.json5'],
    extends: [jsonc.configs['recommended-with-json5'], jsonc.configs.prettier],
    language: 'jsonc/json5',
  },
  {
    files: ['./tsconfig.json'],
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
  pluginPrettier,
)
