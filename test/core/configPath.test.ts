import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: vi.fn(actual.homedir) }
})

describe('PicGo configuration paths', () => {
  let homeDir: string
  let dataPath: string
  let legacyPath: string

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(path.join(tmpdir(), 'piclist-config-path-test-'))
    vi.mocked(homedir).mockReturnValue(homeDir)
    dataPath = path.join(homeDir, '.piclist', 'data.json')
    legacyPath = path.join(homeDir, '.piclist', 'config.json')
  })

  afterEach(async () => {
    vi.mocked(homedir).mockReset()
    await fs.remove(homeDir)
  })

  it.each([undefined, ''])('creates data.json for a new user with config path %s', async configPath => {
    const picgo = new PicGo(configPath)
    picgo.saveConfig({ 'settings.language': 'en' })

    expect(picgo.configPath).toBe(dataPath)
    expect(picgo.baseDir).toBe(path.dirname(dataPath))
    expect(await fs.readJson(dataPath)).toMatchObject({ settings: { language: 'en' } })
    expect(await fs.pathExists(legacyPath)).toBe(false)
  })

  it('reads and updates an existing data.json', async () => {
    await fs.outputJson(dataPath, { settings: { language: 'zh-CN' } })

    const picgo = new PicGo()
    expect(picgo.configPath).toBe(dataPath)
    expect(picgo.getConfig('settings.language')).toBe('zh-CN')
    picgo.saveConfig({ 'settings.language': 'en' })

    expect(await fs.readJson(dataPath)).toMatchObject({ settings: { language: 'en' } })
    expect(await fs.pathExists(legacyPath)).toBe(false)
  })

  it('reads and updates an existing config.json when data.json is absent', async () => {
    await fs.outputJson(legacyPath, { settings: { language: 'zh-CN' } })

    const picgo = new PicGo()
    expect(picgo.configPath).toBe(legacyPath)
    expect(picgo.getConfig('settings.language')).toBe('zh-CN')
    picgo.saveConfig({ 'settings.language': 'en' })

    expect(await fs.readJson(legacyPath)).toMatchObject({ settings: { language: 'en' } })
    expect(await fs.pathExists(dataPath)).toBe(false)
    expect(new PicGo().configPath).toBe(legacyPath)
  })

  it('prefers data.json when both default files exist and leaves config.json untouched', async () => {
    await fs.outputJson(dataPath, { settings: { language: 'en' } })
    await fs.outputJson(legacyPath, { settings: { language: 'zh-CN' } })
    const legacyContents = await fs.readFile(legacyPath, 'utf8')

    const picgo = new PicGo()
    expect(picgo.configPath).toBe(dataPath)
    expect(picgo.getConfig('settings.language')).toBe('en')
    picgo.saveConfig({ 'settings.language': 'zh-TW' })

    expect(await fs.readJson(dataPath)).toMatchObject({ settings: { language: 'zh-TW' } })
    expect(await fs.readFile(legacyPath, 'utf8')).toBe(legacyContents)
  })

  it('honors an explicit config.json even when data.json exists', async () => {
    await fs.outputJson(dataPath, { settings: { language: 'en' } })
    await fs.outputJson(legacyPath, { settings: { language: 'zh-CN' } })
    const dataContents = await fs.readFile(dataPath, 'utf8')

    const picgo = new PicGo(legacyPath)
    expect(picgo.configPath).toBe(legacyPath)
    expect(picgo.getConfig('settings.language')).toBe('zh-CN')
    picgo.saveConfig({ 'settings.language': 'zh-TW' })

    expect(await fs.readJson(legacyPath)).toMatchObject({ settings: { language: 'zh-TW' } })
    expect(await fs.readFile(dataPath, 'utf8')).toBe(dataContents)
  })

  it('creates an explicitly named configuration without creating a default file', async () => {
    const configPath = path.join(homeDir, 'custom', 'config.json')
    const picgo = new PicGo(configPath)

    expect(picgo.configPath).toBe(configPath)
    expect(picgo.baseDir).toBe(path.dirname(configPath))
    expect(await fs.pathExists(configPath)).toBe(true)
    expect(await fs.pathExists(dataPath)).toBe(false)
    expect(await fs.pathExists(legacyPath)).toBe(false)
  })
})
