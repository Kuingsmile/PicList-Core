# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript ESM package and CLI for PicList/PicGo-style image uploading. Source lives in `src/`, with `src/index.ts` as the package entry. Core runtime classes are in `src/core/`, shared helpers in `src/utils/`, CLI and plugin plumbing in `src/lib/` and `src/plugins/`, and type declarations in `src/types/`. Executable entrypoints are `bin/picgo` and `bin/picgo-server`. Tests mirror behavior under `test/`, using paths such as `test/utils/common.test.ts` and `test/plugins/uploader/utils.test.ts`. Static images are in `assets/`; generated build output goes to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

This repository currently tracks `yarn.lock`; use Yarn for consistency unless intentionally migrating package managers.

- `yarn build`: remove `dist/` and build production output with Rollup.
- `yarn dev`: run Rollup in watch mode for development.
- `yarn start`: run the `picgo` CLI from `bin/picgo`.
- `yarn server`: run the local server entrypoint.
- `yarn test`: run the Vitest suite once.
- `yarn test:watch`: run Vitest interactively.
- `yarn test:coverage`: generate V8 coverage reports.
- `yarn lint`: run ESLint across configured files.
- `yarn lint:dpdm`: fail on circular dependencies from `src/index.ts`.
- `yarn cz`: create a commit through the configured Commitizen flow.

## Coding Style & Naming Conventions

Use TypeScript with ESM imports. Prettier enforces 2-space indentation, single quotes, no semicolons, trailing commas, and 120-column wrapping. ESLint requires sorted imports/exports, `eqeqeq`, `prefer-const`, object shorthand, Node protocol imports, and no unused variables unless prefixed with `_`. Keep module and utility filenames lower camel case where the existing tree does, such as `configManager.ts` and `eventBus.ts`.

## Testing Guidelines

Vitest discovers `test/**/*.test.ts` with globals enabled and a 10-second timeout. Add focused tests next to the relevant behavior area under `test/`, and name files `*.test.ts`. Coverage includes `src/**/*.ts` and excludes `src/types/**` and `src/custom-env.d.ts`.

## Commit & Pull Request Guidelines

Recent history uses emoji-prefixed conventional subjects, for example `:sparkles: Feature(custom): add new command...` and `:bug: Fix(custom): fix docker build issue...`. Prefer `yarn cz` so commitlint and release tooling stay aligned. Pull requests should include a concise summary, linked issues when applicable, validation commands/results, and screenshots or logs for CLI/server behavior changes.

## Security & Configuration Tips

Never log secrets, tokens, private prompts, or private file contents. Before adding a production dependency, document why it is needed and summarize maintenance, license, security, Electron compatibility, and bundle/runtime impact.
