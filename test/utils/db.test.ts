import os from 'node:os'
import path from 'node:path'

import { JSONStore } from '@piclist/store'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IPicGo } from '../../src/types'
import DB from '../../src/utils/db'

describe('DB configuration persistence', () => {
  let baseDir: string
  let configPath: string
  let ctx: IPicGo

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-store-test-'))
    configPath = path.join(baseDir, 'config.json')
    ctx = { configPath, log: { error: vi.fn() } } as unknown as IPicGo
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(baseDir)
  })

  it('initializes defaults in an empty configuration file', async () => {
    await fs.ensureFile(configPath)
    const db = new DB(ctx)

    expect(await fs.readJson(configPath)).toEqual({
      picBed: { current: 'smms', uploader: 'smms', smms: { token: '' } },
      picgoPlugins: {},
    })
    expect(db.read()).toEqual(await fs.readJson(configPath))
  })

  it('saves dot and bracket paths together while preserving comments and JSON values', async () => {
    await fs.writeFile(configPath, '{\n// Retain this comment.\n"settings": {"old": true}\n}')
    const db = new DB(ctx)

    db.saveConfig({
      settings: { enabled: false, optional: null, items: ['first', 'second'] },
      'settings.items[1]': 'updated',
      'picgoPlugins[picgo-plugin-example]': true,
    })

    const reopened = new DB(ctx)
    expect(reopened.get('settings')).toEqual({ enabled: false, optional: null, items: ['first', 'updated'] })
    expect(reopened.get('picgoPlugins[picgo-plugin-example]')).toBe(true)
    expect(await fs.readFile(configPath, 'utf8')).toContain('// Retain this comment.')
  })

  it('silently migrates the legacy secondary mode once while preserving comments and other settings', async () => {
    const config = {
      picBed: { uploader: 'local' },
      picgoPlugins: {},
      settings: { enableSecondUploader: false, secondPicBedMode: 'seperate', keep: true },
      'test-plugin': { enabled: true },
    }
    await fs.writeFile(configPath, `// Retain this comment.\n${JSON.stringify(config, null, 2)}`)
    const set = vi.spyOn(JSONStore.prototype, 'set')

    const db = new DB(ctx)

    expect(db.read()).toEqual({ ...config, settings: { ...config.settings, secondPicBedMode: 'separate' } })
    const migrated = await fs.readFile(configPath, 'utf8')
    expect(migrated).toContain('// Retain this comment.')
    expect(migrated).toContain('"separate"')
    expect(migrated).not.toContain('"seperate"')
    expect(new DB(ctx).get('settings.secondPicBedMode')).toBe('separate')
    expect(set).toHaveBeenCalledExactlyOnceWith('settings.secondPicBedMode', 'separate')
    expect(await fs.readFile(configPath, 'utf8')).toBe(migrated)
    expect(ctx.log.error).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { secondPicBedMode: 'shared' }, { secondPicBedMode: 'separate' }])(
    'leaves existing settings unchanged when no migration is needed: %j',
    async settings => {
      const contents = JSON.stringify({ picBed: { uploader: 'local' }, picgoPlugins: {}, settings })
      await fs.writeFile(configPath, contents)
      const set = vi.spyOn(JSONStore.prototype, 'set')

      const db = new DB(ctx)
      db.read(true)

      expect(db.read().settings).toEqual(settings)
      expect(await fs.readFile(configPath, 'utf8')).toBe(contents)
      expect(set).not.toHaveBeenCalled()
    },
  )

  it.each([
    { name: 'flushed', read: (db: DB) => db.read(true).settings?.secondPicBedMode },
    { name: 'keyed', read: (db: DB) => db.get('settings.secondPicBedMode') },
    { name: 'whole-config', read: (db: DB) => db.getSingle().settings?.secondPicBedMode },
  ])('migrates legacy settings restored on disk before $name reads', async ({ read }) => {
    const db = new DB(ctx)
    const saved = await fs.readJson(configPath)
    await fs.writeJson(configPath, { ...saved, settings: { secondPicBedMode: 'seperate', external: true } })

    expect(read(db)).toBe('separate')

    expect((await fs.readJson(configPath)).settings).toEqual({ secondPicBedMode: 'separate', external: true })
  })

  it('rolls back the entire save when a later setting cannot be serialized', async () => {
    const db = new DB(ctx)
    db.saveConfig({ 'settings.value': 'original' })
    const saved = await fs.readFile(configPath, 'utf8')
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => db.saveConfig({ 'settings.value': 'changed', 'settings.circular': circular })).toThrow()

    expect(await fs.readFile(configPath, 'utf8')).toBe(saved)
    expect(db.read().settings).toEqual({ value: 'original' })
  })

  it.each(['set', 'saveConfig', 'unset'] as const)('preserves external changes when calling %s', async method => {
    const db = new DB(ctx)
    const saved = await fs.readJson(configPath)
    await fs.writeJson(configPath, { ...saved, settings: { external: true, value: 'old' } })

    if (method === 'set') db.set('settings.value', 'new')
    if (method === 'saveConfig') db.saveConfig({ 'settings.value': 'new', 'settings.enabled': false })
    if (method === 'unset') expect(db.unset('settings', 'value')).toBe(true)

    const settings = (await fs.readJson(configPath)).settings
    expect(settings.external).toBe(true)
    expect(settings.value).toBe(method === 'unset' ? undefined : 'new')
    if (method === 'saveConfig') expect(settings.enabled).toBe(false)
  })

  it('refreshes external changes for flushed, keyed, whole-config, and existence reads', async () => {
    const db = new DB(ctx)
    const saved = await fs.readJson(configPath)

    for (const read of [
      () => db.read(true).settings?.external,
      () => db.get('settings.external'),
      () => db.getSingle().settings.external,
      () => db.has('settings.external'),
    ]) {
      await fs.writeJson(configPath, saved)
      db.read(true)
      await fs.writeJson(configPath, { ...saved, settings: { external: true } })
      expect(read()).toBe(true)
    }
  })

  it('supports legacy parent/child removal with bracket paths and compact arrays', async () => {
    const db = new DB(ctx)
    db.saveConfig({ settings: { items: ['first', 'second', 'third'], keep: true } })

    expect(db.unset('settings', 'items[1]')).toBe(true)
    expect(db.unset('settings', 'missing')).toBe(false)
    expect((await fs.readJson(configPath)).settings).toEqual({ items: ['first', 'third'], keep: true })
  })

  it.each(['{"settings":', '[]', 'null'])('preserves an invalid configuration file (%s)', async contents => {
    await fs.writeFile(configPath, contents)

    expect(() => new DB(ctx)).toThrow(expect.objectContaining({ code: 'INVALID_STORE' }))
    expect(await fs.readFile(configPath, 'utf8')).toBe(contents)
  })
})
