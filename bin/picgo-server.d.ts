import type { Server } from 'node:http'

interface UploadResult {
  ctx?: {
    output: { imgUrl?: unknown }[]
  }
}

interface PicGoServer {
  httpServer: Server
  startup: () => void
  shutdown: (hasStarted?: boolean) => void
  restart: () => void
}

declare const server: PicGoServer

export const getUploadedImageUrls: (result: UploadResult, expectedCount: number) => string[] | null
export default server
