declare module '*.sh' {
  const src: string
  export default src
}
declare module '*.applescript' {
  const src: string
  export default src
}
declare module '*.ps1' {
  const src: string
  export default src
}

// The SSH fork uses the upstream API but does not publish declarations under its package name.
declare module 'ssh2-no-cpu-features' {
  export * from 'ssh2'
}

// node-ssh-no-cpu-features still imports these types from the legacy streams package.
declare module 'ssh2-streams' {
  export type { Prompt, TransferOptions } from 'ssh2'
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly PICGO_VERSION: string
  }
}
