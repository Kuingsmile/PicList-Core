import crypto from 'node:crypto'

export function getMd5(input: crypto.BinaryLike): string {
  return crypto.createHash('md5').update(input).digest('hex')
}

export function getSha256(input: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function getSha1(input: crypto.BinaryLike): string {
  return crypto.createHash('sha1').update(input).digest('hex')
}
