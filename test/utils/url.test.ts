import { describe, expect, it } from 'vitest'

import { handleUrlEncode, isUrlEncode } from '../../src/utils/common/url'

describe('URL percent-encoding normalization', () => {
  it.each([
    ['reserved path escapes', 'https://example.com/a%2Fb%26c%3Fd%23e.png', 'https://example.com/a%2Fb%26c%3Fd%23e.png'],
    ['lowercase escapes', 'https://example.com/a%2fb%26c%3fd%23e.png', 'https://example.com/a%2fb%26c%3fd%23e.png'],
    ['encoded percent signs', 'https://example.com/a%252Fb%25.png', 'https://example.com/a%252Fb%25.png'],
    [
      'mixed encoded and raw path segments',
      'https://example.com/encoded%20folder/raw space/中文%2F😀.png',
      'https://example.com/encoded%20folder/raw%20space/%E4%B8%AD%E6%96%87%2F%F0%9F%98%80.png',
    ],
    [
      'mixed text within one segment',
      'https://example.com/%E4%B8%AD文 photo.png',
      'https://example.com/%E4%B8%AD%E6%96%87%20photo.png',
    ],
    [
      'literal percent signs',
      'https://example.com/100% done.png?discount=50%#100%',
      'https://example.com/100%25%20done.png?discount=50%25#100%25',
    ],
    ['incomplete escape', 'https://example.com/a%2', 'https://example.com/a%252'],
    ['non-hex escape', 'https://example.com/a%GG%2G', 'https://example.com/a%25GG%252G'],
    ['mixed valid and malformed escapes', 'https://example.com/a%2F%ZZ%20b%', 'https://example.com/a%2F%25ZZ%20b%25'],
    ['consecutive percent signs', 'https://example.com/%%2F%%', 'https://example.com/%25%2F%25%25'],
    [
      'escaped non-UTF-8 bytes',
      'https://example.com/%FF%C0%AF%E4%B8%ED%A0%80',
      'https://example.com/%FF%C0%AF%E4%B8%ED%A0%80',
    ],
    [
      'raw query text',
      'https://example.com/photo.png?q=中文 space&name=a%26b&literal=50%',
      'https://example.com/photo.png?q=%E4%B8%AD%E6%96%87%20space&name=a%26b&literal=50%25',
    ],
    [
      'plus signs and encoded spaces',
      'https://example.com/a+b%2Bc d.png?q=a+b%2Bc%20d e#x+y%2Bz w',
      'https://example.com/a+b%2Bc%20d.png?q=a+b%2Bc%20d%20e#x+y%2Bz%20w',
    ],
    [
      'fragments containing URL delimiters',
      'https://example.com/a%23b?q=c%23d#章节 one%2Ftwo?x=a+b&y=%26',
      'https://example.com/a%23b?q=c%23d#%E7%AB%A0%E8%8A%82%20one%2Ftwo?x=a+b&y=%26',
    ],
    ['empty query and fragment', 'https://example.com/photo.png?#', 'https://example.com/photo.png?#'],
    ['IPv6 authority', 'https://[2001:db8::1]:8443/a%2Fb c.png', 'https://[2001:db8::1]:8443/a%2Fb%20c.png'],
    ['escaped brackets', 'https://example.com/%5Ba%5Db%5bc%5d', 'https://example.com/%5Ba%5Db%5bc%5d'],
    ['control characters', 'https://example.com/a\tb\nc\rd', 'https://example.com/a%09b%0Ac%0Dd'],
    ['relative references', '/a%2Fb/中文 space?q=a%26b#one two', '/a%2Fb/%E4%B8%AD%E6%96%87%20space?q=a%26b#one%20two'],
    ['an empty string', '', ''],
  ])('normalizes %s and is idempotent', (_description, input, expected) => {
    const normalized = handleUrlEncode(input)

    expect(normalized).toBe(expected)
    expect(handleUrlEncode(normalized)).toBe(normalized)
  })

  it('preserves a signed URL byte for byte, including query syntax and escape casing', () => {
    const url =
      'https://EXAMPLE.com:443/a/../b//%2e/a%2Fb.png' +
      '?X-Amz-Credential=synthetic%2Fscope&X-Amz-Signature=synthetic%2Fsignature%26value' +
      "&token=a+b%2Bc%3D&tag=first&tag=second&flag&empty=&raw=~!'()*,:;@/?:[]&escape=%7e%2f&&#part%23one"

    expect(handleUrlEncode(url)).toBe(url)
    expect(handleUrlEncode(handleUrlEncode(url))).toBe(url)
  })

  it('preserves a signed query while encoding raw path and fragment text', () => {
    const query = '?Signature=synthetic%2fvalue%26data%3D&token=a+b&tag=1&tag=2&flag&empty=&x=~'
    const input = `https://example.com/中文 photo%2Fone.png${query}#章节 one`
    const expected = `https://example.com/%E4%B8%AD%E6%96%87%20photo%2Fone.png${query}#%E7%AB%A0%E8%8A%82%20one`

    expect(handleUrlEncode(input)).toBe(expected)
    expect(handleUrlEncode(expected)).toBe(expected)
  })

  it.each(['\uD800', '\uDC00'])('rejects an unpaired surrogate rather than changing the object key', surrogate => {
    expect(() => handleUrlEncode(`https://example.com/%20${surrogate}.png`)).toThrow(URIError)
  })
})

describe('isUrlEncode', () => {
  it.each(['%2F', '%26', '%3f', '%23', '%25', '%E4%B8%AD', '%FF', '%2F%ZZ raw'])(
    'detects an existing escape in %s',
    value => {
      expect(isUrlEncode(`https://example.com/${value}`)).toBe(true)
    },
  )

  it.each(['', 'plain', '中文 space', '%', '%2', '%GG', '%2G', 'a+b'])('does not mistake %s for an escape', value => {
    expect(isUrlEncode(value)).toBe(false)
  })
})
