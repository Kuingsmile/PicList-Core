import { describe, expect, it } from 'vitest'

import { encodePath, formatPathHelper } from '../../../src/plugins/uploader/utils'

describe('formatPathHelper', () => {
  it('should return empty string for undefined path when rootToEmpty=true (default)', () => {
    expect(formatPathHelper({ path: undefined })).toBe('')
    expect(formatPathHelper({})).toBe('')
  })

  it('should return "/" for undefined path when rootToEmpty=false', () => {
    expect(formatPathHelper({ path: undefined, rootToEmpty: false })).toBe('/')
  })

  it('should return empty string for "/" when rootToEmpty=true (default)', () => {
    expect(formatPathHelper({ path: '/' })).toBe('')
  })

  it('should strip leading/trailing slashes and add trailing slash', () => {
    expect(formatPathHelper({ path: '/images/' })).toBe('images/')
    expect(formatPathHelper({ path: '///images///' })).toBe('images/')
  })

  it('should add start slash when requested', () => {
    expect(formatPathHelper({ path: 'images/photos', startSlash: true })).toBe('/images/photos/')
  })

  it('should omit end slash when endSlash=false', () => {
    expect(formatPathHelper({ path: 'images/photos', endSlash: false })).toBe('images/photos')
  })

  it('should handle combined options', () => {
    expect(
      formatPathHelper({
        path: '/a/b/c/',
        startSlash: true,
        endSlash: false,
      }),
    ).toBe('/a/b/c')
  })

  it('should collapse multiple consecutive slashes', () => {
    expect(formatPathHelper({ path: 'a///b//c' })).toBe('a/b/c/')
  })
})

describe('encodePath', () => {
  it('should encode path segments individually', () => {
    expect(encodePath('images/my photo.png')).toBe('images/my%20photo.png')
  })

  it('should preserve slashes', () => {
    expect(encodePath('a/b/c')).toBe('a/b/c')
  })

  it('should encode special characters', () => {
    expect(encodePath('dir/文件.png')).toBe('dir/%E6%96%87%E4%BB%B6.png')
  })

  it('should collapse multiple slashes', () => {
    expect(encodePath('a//b///c')).toBe('a/b/c')
  })

  it('should handle empty string', () => {
    expect(encodePath('')).toBe('')
  })
})
