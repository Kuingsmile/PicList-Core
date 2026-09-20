import type { Server } from 'node:http'

interface UploadResult {
  ctx?: {
    output: { imgUrl?: unknown }[]
  }
}

/** Control surface for the HTTP server started by the executable module. */
interface PicGoServer {
  httpServer: Server
  /** Starts listening on the configured default port and host. */
  startup: () => void
  /**
   * Closes the listener; hasStarted suppresses the ordinary shutdown log when an existing server was
   * found.
   */
  shutdown: (hasStarted?: boolean) => void
  /** Closes the current listener and starts it again with configured defaults. */
  restart: () => void
}

declare const server: PicGoServer

/**
 * Returns all primary upload URLs only when their count and nonblank values match expectedCount;
 * otherwise null.
 */
export const getUploadedImageUrls: (result: UploadResult, expectedCount: number) => string[] | null
export default server
