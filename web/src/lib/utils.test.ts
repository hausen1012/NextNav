import { describe, expect, it } from 'vitest'
import { hashHue, hostOf, initialOf, extractDomain, formatFaviconUrl } from './utils'

describe('extractDomain & formatFaviconUrl', () => {
  it('extracts domain correctly', () => {
    expect(extractDomain('https://www.amjun.com/index.html')).toBe('www.amjun.com')
    expect(extractDomain('http://baidu.com')).toBe('baidu.com')
    expect(extractDomain('v2ex.com/t/123')).toBe('v2ex.com')
    expect(extractDomain('')).toBe('')
  })

  it('formats favicon URL using template', () => {
    expect(formatFaviconUrl('https://a.favicon.im/', 'https://www.amjun.com')).toBe('https://a.favicon.im/www.amjun.com')
    expect(formatFaviconUrl('https://a.favicon.im', 'https://www.amjun.com')).toBe('https://a.favicon.im/www.amjun.com')
    expect(formatFaviconUrl('https://nav.amjun.com/api/favicon/{domain}.png', 'https://www.amjun.com')).toBe('https://nav.amjun.com/api/favicon/www.amjun.com.png')
    expect(formatFaviconUrl('/api/favicon/{domain}.png', 'baidu.com')).toBe('/api/favicon/baidu.com.png')
    expect(formatFaviconUrl('', 'https://www.amjun.com')).toBeNull()
    expect(formatFaviconUrl('https://a.favicon.im', '')).toBeNull()
  })
})

describe('initialOf', () => {
  it('returns the first character of a title', () => {
    expect(initialOf('GitHub')).toBe('G')
  })

  it('handles CJK titles by taking one code point', () => {
    expect(initialOf('微信')).toBe('微')
  })

  it('uppercases latin characters', () => {
    expect(initialOf('figma')).toBe('F')
  })

  it('falls back to ? for blank input', () => {
    expect(initialOf('   ')).toBe('?')
    expect(initialOf('')).toBe('?')
  })
})

describe('hostOf', () => {
  it('strips a leading www and returns the host', () => {
    expect(hostOf('https://www.github.com/foo')).toBe('github.com')
    expect(hostOf('https://news.ycombinator.com/')).toBe('news.ycombinator.com')
  })

  it('keeps subdomains other than www', () => {
    expect(hostOf('https://js.design')).toBe('js.design')
  })

  it('falls back to the raw input when the URL is invalid', () => {
    expect(hostOf('not a url')).toBe('not a url')
  })
})

describe('hashHue', () => {
  it('is deterministic and inside the hue range', () => {
    const a = hashHue('https://github.com')
    const b = hashHue('https://github.com')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(360)
  })

  it('differs for different inputs', () => {
    expect(hashHue('github.com')).not.toBe(hashHue('gitlab.com'))
  })
})