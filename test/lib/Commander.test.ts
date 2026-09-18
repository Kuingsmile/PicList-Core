import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import { EN } from '../../src/i18n/en'
import { ZH_CN } from '../../src/i18n/zh-CN'
import { ZH_TW } from '../../src/i18n/zh-TW'
import { setCurrentPluginName } from '../../src/lib/LifecyclePlugins'

describe('CLI help translations', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-cli-help-test-'))
    vi.stubEnv('PICGO_VERSION', '0.0.0-test')
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    setCurrentPluginName('')
    await fs.remove(baseDir)
  })

  async function createPicGo(language: string) {
    const configPath = path.join(baseDir, 'config.json')
    await fs.writeJson(configPath, { settings: { language } })
    return PicGo.create(configPath)
  }

  it.each([
    ['en', EN],
    ['zh-CN', ZH_CN],
    ['zh-TW', ZH_TW],
  ] as const)('uses the saved %s locale for command and option descriptions', async (language, locale) => {
    const ctx = await createPicGo(language)
    ctx.registerCommands()
    const program = ctx.cmd.program
    const help = program.helpInformation()

    for (const description of [
      locale.CLI_LIST,
      locale.CLI_INSTALL,
      locale.CLI_UNINSTALL,
      locale.CLI_UPDATE,
      locale.CLI_CONFIG_LIST,
      locale.CLI_CONFIG_USE,
      locale.CLI_CONFIG_REMOVE,
      locale.CLI_CONFIG_RENAME,
      locale.CLI_CONFIG_SHOW,
      locale.CLI_UPLOAD,
      locale.CLI_USE,
      locale.CLI_I18N,
      locale.CLI_HELP,
      locale.CLI_OPTION_VERSION,
      locale.CLI_OPTION_DEBUG,
      locale.CLI_OPTION_SILENT,
      locale.CLI_OPTION_CONFIG,
      locale.CLI_OPTION_PROXY,
      locale.CLI_OPTION_HELP,
    ]) {
      expect(help).toContain(description)
    }
    expect(help).not.toContain('CLI_')
    expect(help).toContain('-c, --config <path>')
    expect(help).toContain('-p, --proxy <url>')
    expect(help).toContain('install|add')
    expect(help).toContain('upload|u')
    expect(program.commands.find(command => command.name() === 'set')!.description()).toBe(locale.CLI_SET)

    for (const name of ['install', 'update']) {
      const commandHelp = program.commands.find(command => command.name() === name)!.helpInformation()
      expect(commandHelp).toContain(locale.CLI_OPTION_PLUGIN_PROXY)
      expect(commandHelp).toContain(locale.CLI_OPTION_PLUGIN_REGISTRY)
      expect(commandHelp).toContain(locale.CLI_OPTION_HELP)
      expect(commandHelp).toContain('-p, --proxy <proxy>')
      expect(commandHelp).toContain('-r, --registry <registry>')
    }
    const uploadHelp = program.commands.find(command => command.name() === 'upload')!.helpInformation()
    expect(uploadHelp).toContain(locale.CLI_UPLOAD)
    expect(uploadHelp).toContain(locale.CLI_OPTION_HELP)
  })

  it('uses plugin locale overrides and keeps custom plugin command descriptions', async () => {
    const ctx = await createPicGo('en')
    await ctx.use(
      ctx => ({
        register: () => {
          ctx.i18n.addLocale('en', {
            CLI_UPLOAD: 'Send a picture',
            CLI_OPTION_PLUGIN_PROXY: 'Plugin proxy override',
            CUSTOM_PLUGIN_DESCRIPTION: 'Choose a file',
          })
          ctx.cmd.register('custom-command', {
            handle: ctx => {
              ctx.cmd.program.command('custom').description(ctx.i18n.translate('CUSTOM_PLUGIN_DESCRIPTION'))
            },
          })
        },
      }),
      'picgo-plugin-help-test',
    )
    ctx.registerCommands()

    expect(ctx.cmd.program.helpInformation()).toContain('Send a picture')
    expect(ctx.cmd.program.helpInformation()).toContain('Choose a file')
    const install = ctx.cmd.program.commands.find(command => command.name() === 'install')!
    expect(install.helpInformation()).toContain('Plugin proxy override')
  })

  it('uses custom YAML descriptions', async () => {
    await fs.outputFile(
      path.join(baseDir, 'i18n-cli/fr.yml'),
      'CLI_UPLOAD: Envoyer une image\nCLI_OPTION_HELP: Afficher les instructions\n',
    )
    const ctx = await createPicGo('fr')
    ctx.registerCommands()

    expect(ctx.cmd.program.helpInformation()).toContain('Envoyer une image')
    const upload = ctx.cmd.program.commands.find(command => command.name() === 'upload')!
    expect(upload.helpInformation()).toContain('Afficher les instructions')
  })
})
