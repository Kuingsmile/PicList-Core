import { vi } from 'vitest'

import { LifecyclePlugins } from '../../src/lib/LifecyclePlugins'
import type { IImgInfo, IOldReqOptions, IPicGo } from '../../src/types'

/**
 * Registers an uploader against a mock client with cloned settings, synthetic image data, and
 * inspectable request calls.
 */
export function createUploader(
  register: (ctx: IPicGo) => void,
  configKey: string,
  config: Record<string, unknown> | undefined,
  output: IImgInfo[] = [{ fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }],
) {
  const registry = new LifecyclePlugins('uploader')
  const ctx = {
    baseDir: '',
    output,
    getConfig: vi.fn((key: string) => (key === configKey ? structuredClone(config) : undefined)),
    request: vi.fn<(_options: IOldReqOptions) => Promise<any>>(),
    emit: vi.fn(),
    i18n: { t: (key: string) => key, translate: (key: string) => key },
    helper: { uploader: registry },
  }
  register(ctx as unknown as IPicGo)
  const plugin = registry.getList()[0]
  return {
    ctx,
    plugin,
    upload: async () => plugin.handle(ctx as unknown as IPicGo),
    getFields: () => plugin.config!(ctx as unknown as IPicGo),
  }
}
