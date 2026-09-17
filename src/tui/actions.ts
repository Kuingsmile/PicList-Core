import { randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import { handleSecondUploader } from '../plugins/commander/secondUploader'
import { handleBuildinModule, handlePlugin } from '../plugins/commander/setting'
import { uploaderTranslators } from '../plugins/commander/utils'
import type { IPicGo } from '../types'
import type { IInquirerQuestion } from '../utils/inquirerShim'
import { translator } from './i18n'
import { invalidFields, uploaderReady } from './readiness'
import { TuiError } from './session'

export interface TuiAction {
  id: string
  label: string
  description: string
  run: () => Promise<string[] | void>
}

/** Split pasted file paths without interpreting shell syntax or Windows backslashes. */
export function parseUploadPaths(input: string): string[] {
  const paths: string[] = []
  let value = ''
  let quote = ''
  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) quote = ''
      else value += char
    } else if ((char === '"' || char === "'") && value === '') {
      quote = char
    } else if (/\s/.test(char)) {
      if (value) paths.push(value)
      value = ''
    } else {
      value += char
    }
  }
  if (quote) throw new TuiError('Close the quote around each file path.')
  if (value) paths.push(value)
  return paths
}

export async function validateUploadPaths(input: string): Promise<string[]> {
  const values = parseUploadPaths(input)
  if (!values.length) throw new TuiError('Enter at least one file path or HTTP(S) URL.')
  const resolved: string[] = []
  for (const value of values) {
    if (/^https?:\/\//i.test(value)) {
      try {
        new URL(value)
      } catch {
        throw new TuiError('Enter a valid HTTP(S) URL.')
      }
      resolved.push(value)
    } else {
      const file = path.resolve(value.replace(/^~(?=[/\\]|$)/, homedir()))
      const stat = await fs.stat(file).catch(() => undefined)
      if (!stat?.isFile())
        throw new TuiError('One of the paths is missing or is not a file. Check the paths and quotes.')
      resolved.push(file)
    }
  }
  return resolved
}

export function createActions(ctx: IPicGo): TuiAction[] {
  const t = translator(ctx)
  const ask = async <T>(question: Omit<IInquirerQuestion, 'name'>): Promise<T> => {
    const answer = await ctx.cmd.inquirer.prompt<{ value: T }>([
      {
        ...question,
        name: 'value',
        type: question.type,
        message: question.message ? t(question.message) : undefined,
        description: question.description ? t(question.description) : undefined,
      },
    ])
    return answer.value
  }
  const choose = <T>(message: string, choices: { name: string; value: T }[], defaultValue?: T) => {
    if (!choices.length) throw new TuiError('No items are available. Configure an uploader or install a plugin first.')
    return ask<T>({ type: 'list', message, choices, default: defaultValue })
  }
  const chooseUploader = () =>
    choose(
      'Choose an uploader',
      ctx.helper.uploader.getIdList().map(value => ({
        name: `${uploaderTranslators(ctx)[value] || value} (${value})`,
        value,
      })),
      ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current'),
    )
  const chooseConfig = async (uploader: string) => {
    const configs = ctx.configManager.getAllUploaderConfigs(uploader)
    const current = ctx.configManager.getCurrentUploaderConfig(uploader)
    const id = await choose(
      'Choose a saved configuration',
      configs.map(config => ({
        name: `${config._configName}${config._id === current?._id ? ` (${t('Default')})` : ''}`,
        value: config._id,
      })),
      current?._id,
    )
    return configs.find(config => config._id === id)!
  }
  const configName = (uploader: string, defaultName = '') =>
    ask<string>({
      type: 'input',
      message: 'Configuration name',
      default: defaultName,
      validate: (value: string) =>
        !value.trim()
          ? 'Enter a name.'
          : ctx.configManager.getConfigByName(uploader, value.trim())
            ? 'This name already exists.'
            : true,
      filter: (value: string) => value.trim(),
    })
  const configureUploader = async (uploader: string, name: string, editing: boolean) => {
    const plugin = ctx.helper.uploader.get(uploader)
    if (!plugin?.config) throw new TuiError('This uploader has no configuration form.')
    const existing = editing ? ctx.configManager.getConfigByName(uploader, name) : undefined
    const questions = plugin.config(ctx).map(question => ({
      ...question,
      default: existing && question.name in existing ? existing[question.name] : question.default,
    }))
    const answer = await ctx.cmd.inquirer.prompt(questions)
    // Validate again after filters have run, before persisting any part of the form.
    let valid = false
    try {
      valid = (await invalidFields(questions, answer)).length === 0
    } catch {
      /* Provider validation errors are not safe to display. */
    }
    if (!valid) throw new TuiError(t('Check the required fields and validation rules before saving this destination.'))
    if (existing) ctx.configManager.updateUploaderConfig(uploader, existing._id, answer)
    else {
      const created = ctx.configManager.addUploaderConfig(uploader, name, answer)
      ctx.configManager.setDefaultConfig(uploader, created._id)
    }
    ctx.saveConfig({ 'picBed.uploader': uploader, 'picBed.current': uploader })
  }
  const upload = async (input?: string[]) => {
    await requireDestination()
    const result = await ctx.uploadReturnCtx(input)
    const urls = result.ctx?.output.filter(item => item.imgUrl).map(item => item.imgUrl!) || []
    const backup = result.backupCtx?.output.filter(item => item.imgUrl).map(item => `Backup: ${item.imgUrl}`) || []
    if (!urls.length) throw new TuiError('No images were uploaded. Check the input and uploader settings.')
    return [...urls, ...backup]
  }
  const requireDestination = async () => {
    if (!(await uploaderReady(ctx)))
      throw new TuiError(t('Complete the required destination settings before uploading or checking the connection.'))
  }

  return [
    {
      label: 'Set up a destination',
      description: 'Connect an uploader with a named configuration. You only need to do this once.',
      run: async () => {
        const uploader = await chooseUploader()
        const name = await configName(uploader, ctx.configManager.getConfigByName(uploader, 'Default') ? '' : 'Default')
        await configureUploader(uploader, name, false)
      },
    },
    {
      label: 'Check connection',
      description: 'Upload a small test image using your current upload settings.',
      run: async () => {
        await requireDestination()
        if (
          !(await ask<boolean>({
            type: 'confirm',
            message: 'Upload a test image?',
            description:
              'This uses your current processing and backup settings and leaves a test image at each destination.',
            default: false,
          }))
        )
          return
        const directory = await fs.mkdtemp(path.join(tmpdir(), 'piclist-connection-'))
        try {
          const file = path.join(directory, `piclist-connection-${randomUUID()}.png`)
          await fs.writeFile(
            file,
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
              'base64',
            ),
          )
          return await upload([file])
        } finally {
          await fs.remove(directory)
        }
      },
    },
    {
      label: 'Upload files or URLs',
      description: 'Paste paths or HTTP(S) URLs; quote paths containing spaces.',
      run: async () => {
        const input = await ask<string>({
          type: 'input',
          message: 'File paths or URLs',
          description: 'Separate files with spaces. Put quotes around paths containing spaces.',
          placeholder: '"./photos/morning light.jpg" https://example.com/image.png',
          required: true,
          validate: async (value: string) => {
            try {
              await validateUploadPaths(value)
              return true
            } catch (error) {
              return error instanceof TuiError ? error.message : 'Unable to read these files.'
            }
          },
        })
        return upload(await validateUploadPaths(input))
      },
    },
    {
      label: 'Upload clipboard image',
      description: 'Upload the image currently on your clipboard.',
      run: () => upload(),
    },
    {
      label: 'Switch uploader',
      description: 'Select an uploader and its saved configuration.',
      run: async () => {
        const uploader = await chooseUploader()
        const config = await chooseConfig(uploader)
        ctx.configManager.setDefaultConfig(uploader, config._id)
        ctx.saveConfig({ 'picBed.uploader': uploader, 'picBed.current': uploader })
      },
    },
    {
      label: 'Uploader configurations',
      description: 'Create, edit, activate, rename or delete a named configuration.',
      run: async () => {
        const uploader = await chooseUploader()
        const operation = await choose(
          'Manage configurations',
          ['Create', 'Edit', 'Set default', 'Rename', 'Delete'].map(value => ({ name: t(value), value })),
        )
        if (operation === 'Create') {
          await configureUploader(uploader, await configName(uploader, 'Default'), false)
          return
        }
        const config = await chooseConfig(uploader)
        switch (operation) {
          case 'Edit':
            await configureUploader(uploader, config._configName, true)
            break
          case 'Set default':
            ctx.configManager.setDefaultConfig(uploader, config._id)
            break
          case 'Rename':
            ctx.configManager.renameConfig(uploader, config._id, await configName(uploader))
            break
          case 'Delete':
            if (
              await ask<boolean>({
                type: 'confirm',
                message: t('Delete configuration "${name}"?', { name: config._configName }),
                default: false,
              })
            ) {
              if (!ctx.configManager.deleteUploaderConfig(uploader, config._id)) {
                throw new TuiError(
                  'Cannot delete the active/default configuration. Switch to another configuration first.',
                )
              }
            }
            break
        }
      },
    },
    {
      label: 'Secondary uploader',
      description: 'Configure backup uploads using an existing uploader configuration.',
      run: async () => {
        await handleSecondUploader(ctx)
      },
    },
    {
      label: 'Image processing',
      description: 'Configure compression, watermarks, renaming and processing rules.',
      run: async () => {
        const scope = await choose('Apply image processing settings to', [
          { name: t('All uploaders (global settings)'), value: 'global' },
          { name: t('A saved uploader configuration'), value: 'uploader' },
        ])
        if (scope === 'global') await handleBuildinModule(ctx)
        else {
          const uploader = await chooseUploader()
          const config = await chooseConfig(uploader)
          await handleBuildinModule(ctx, undefined, config._configName, uploader)
        }
      },
    },
    {
      label: 'Transformer',
      description: 'Choose and configure the input transformer.',
      run: async () => {
        const name = await choose(
          'Choose a transformer',
          ctx.helper.transformer.getIdList().map(value => ({ name: value, value })),
          ctx.getConfig('picBed.transformer'),
        )
        const plugin = ctx.helper.transformer.get(name)
        const answer = plugin?.config ? await ctx.cmd.inquirer.prompt(plugin.config(ctx)) : undefined
        ctx.saveConfig({ 'picBed.transformer': name, ...(answer ? { [`transformer.${name}`]: answer } : {}) })
      },
    },
    {
      label: 'Plugins',
      description: 'Enable, configure, install, update or remove PicGo plugins.',
      run: async () => {
        const operation = await choose(
          'Manage plugins',
          ['Enable / disable', 'Configure', 'Install', 'Update', 'Uninstall'].map(value => ({ name: t(value), value })),
        )
        const installed = ctx.pluginLoader.getFullList()
        if (operation === 'Install') {
          const name = await ask<string>({
            type: 'input',
            message: 'Plugin package name or local path',
            required: true,
          })
          const result = await ctx.pluginHandler.install([name.trim()], { silent: true })
          if (!result.success)
            throw new TuiError('Plugin installation failed. Check the package name and npm connection.')
        } else if (operation === 'Enable / disable') {
          const enabled = ctx.getConfig<Record<string, boolean>>('picgoPlugins') || {}
          const selected = await ask<string[]>({
            type: 'checkbox',
            message: 'Enable plugins (Space to toggle)',
            choices: installed,
            default: installed.filter(name => enabled[name]),
          })
          ctx.saveConfig({ picgoPlugins: Object.fromEntries(installed.map(name => [name, selected.includes(name)])) })
        } else {
          const name = await choose(
            'Choose an installed plugin',
            installed.map(value => ({ name: value, value })),
          )
          if (operation === 'Configure') await handlePlugin(ctx, name)
          else if (operation === 'Update') {
            const result = await ctx.pluginHandler.update([name], { silent: true })
            if (!result.success) throw new TuiError('Plugin update failed. Check your npm connection.')
          } else if (
            await ask<boolean>({ type: 'confirm', message: t('Uninstall ${name}?', { name }), default: false })
          ) {
            const result = await ctx.pluginHandler.uninstall([name], { silent: true })
            if (!result.success) throw new TuiError('Plugin removal failed.')
          }
        }
        return ['Plugin changes are saved. Restart PicList to reload plugin code.']
      },
    },
    {
      label: 'Proxy',
      description: 'Set or clear the upload proxy.',
      run: async () => {
        const proxy = await ask<string>({
          type: 'password',
          message: 'Upload proxy URL (empty to clear)',
          default: ctx.getConfig('picBed.proxy') || '',
          validate: (value: string) => {
            if (!value.trim()) return true
            try {
              return ['http:', 'https:'].includes(new URL(value).protocol) || 'Use an HTTP(S) proxy URL.'
            } catch {
              return 'Use a valid HTTP(S) proxy URL.'
            }
          },
        })
        ctx.saveConfig({ 'picBed.proxy': proxy.trim() })
      },
    },
    {
      label: 'Language',
      description: 'Change the language used by navigation and forms.',
      run: async () => {
        const language = await choose(
          'Choose a language',
          ctx.i18n.getLanguageList().map(value => ({ name: value, value })),
          ctx.getConfig('settings.language'),
        )
        ctx.i18n.setLanguage(language)
      },
    },
  ].map(action => ({ ...action, id: action.label, label: t(action.label), description: t(action.description) }))
}
