import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import type { IImgInfo, IPicGo, IUploadProgressEvent } from '../types'

interface FileProgress {
  size: number | null
  sent: number
  complete: boolean
}

const trackers = new WeakMap<IPicGo, UploadProgress>()
const UPDATE_INTERVAL_MS = 100

/** Keeps payload sizes before uploaders release their buffers; contexts never share counters. */
export class UploadProgress {
  private readonly uploadId = randomUUID()
  private readonly emit: IPicGo['emit']
  private readonly files = new Map<IImgInfo, FileProgress>()
  private phase: IUploadProgressEvent['phase'] = 'preparing'
  private measured = false
  private settled = false
  private lastUpdate = 0
  private lastPercentage = 0
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    ctx: IPicGo,
    private readonly destination: IUploadProgressEvent['destination'] = 'primary',
  ) {
    // SDK callbacks and trailing updates must retain the owning desktop upload's async context.
    this.emit = AsyncLocalStorage.bind(ctx.emit.bind(ctx))
    trackers.set(ctx, this)
  }

  preparing(): void {
    this.publish(true)
  }

  start(files: IImgInfo[]): void {
    for (const file of files) {
      const size = file.buffer?.length ?? (file.base64Image ? Buffer.byteLength(file.base64Image, 'base64') : null)
      this.files.set(file, { size, sent: 0, complete: false })
    }
    this.phase = 'uploading'
    this.publish(true)
  }

  update(file: IImgInfo, loaded: number, total?: number): void {
    const state = this.files.get(file)
    if (this.settled || this.phase !== 'uploading' || !state || state.complete) return
    if (!Number.isFinite(loaded) || loaded < 0 || !Number.isFinite(total) || total! <= 0) return
    if (state.size === null) return
    // Scale wire bytes to payload bytes, so JSON/base64 and multipart overhead do not inflate totals.
    state.sent = Math.max(state.sent, Math.min(1, loaded / total!) * state.size)
    this.measured = true
    this.publish()
  }

  completeFile(file: IImgInfo): void {
    const state = this.files.get(file)
    if (this.settled || this.phase !== 'uploading' || !state || state.complete) return
    state.complete = true
    state.sent = state.size ?? 0
    this.measured = true
    this.publish(true)
  }

  finalizing(files: IImgInfo[]): void {
    // Plugins without callbacks still contribute confirmed file completions, never estimated bytes.
    for (const file of files) {
      if (file.imgUrl) this.completeFile(file)
    }
    this.phase = 'finalizing'
    this.publish(true)
  }

  finish(failed = false): void {
    if (this.settled) return
    this.phase = failed ? 'failed' : 'completed'
    this.publish(true)
    this.settled = true
  }

  private publish(immediate = false): void {
    if (this.settled) return
    const delay = UPDATE_INTERVAL_MS - (Date.now() - this.lastUpdate)
    if (!immediate && delay > 0) {
      this.timer ??= setTimeout(() => {
        this.timer = undefined
        this.publish(true)
      }, delay)
      this.timer.unref()
      return
    }
    clearTimeout(this.timer)
    this.timer = undefined
    this.lastUpdate = Date.now()
    const files = [...this.files.values()]
    const totalBytes =
      files.length && files.every(file => file.size !== null) ? files.reduce((sum, file) => sum + file.size!, 0) : null
    const transferredBytes = Math.floor(files.reduce((sum, file) => sum + file.sent, 0))
    const progress =
      this.phase === 'completed'
        ? 100
        : this.phase === 'uploading' && this.measured && totalBytes !== null && totalBytes > 0
          ? Math.min(100, Math.floor((transferredBytes / totalBytes) * 100))
          : null
    if (progress !== null) this.lastPercentage = progress
    const event: IUploadProgressEvent = {
      uploadId: this.uploadId,
      destination: this.destination,
      phase: this.phase,
      progress,
      transferredBytes,
      totalBytes,
      completedFiles: files.filter(file => file.complete).length,
      totalFiles: files.length,
    }
    // Existing plugins/CLI integrations keep their numeric event argument.
    this.emit('uploadProgress', this.phase === 'failed' ? -1 : this.lastPercentage, event)
  }
}

/** Attach to the file-transfer request only; authentication and metadata requests are not uploads. */
export function createUploadProgressCallback(ctx: IPicGo, file: IImgInfo) {
  const tracker = trackers.get(ctx)
  return ({ loaded, total }: { loaded?: number; total?: number }) => {
    if (loaded !== undefined) tracker?.update(file, loaded, total)
  }
}

/** Call after the provider confirms a file, including providers without byte callbacks. */
export function completeUploadFile(ctx: IPicGo, file: IImgInfo): void {
  trackers.get(ctx)?.completeFile(file)
}
