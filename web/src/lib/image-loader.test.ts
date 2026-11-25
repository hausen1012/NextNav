import { describe, expect, it, beforeEach } from 'vitest'
import { isImageCached, markImageCached, clearImageCache, preloadImage } from './image-loader'

describe('image-loader', () => {
  beforeEach(() => {
    clearImageCache()
  })

  it('correctly tracks cached image URLs', () => {
    expect(isImageCached('https://example.com/icon.png')).toBe(false)
    markImageCached('https://example.com/icon.png')
    expect(isImageCached('https://example.com/icon.png')).toBe(true)
    expect(isImageCached('https://example.com/other.jpg')).toBe(false)
  })

  it('rejects empty or blank URLs', async () => {
    await expect(preloadImage('')).rejects.toThrow('Empty image URL')
  })

  it('resolves immediately if already cached', async () => {
    markImageCached('https://example.com/cached.png')
    const result = await preloadImage('https://example.com/cached.png')
    expect(result).toBe('https://example.com/cached.png')
  })

  it('preloads and marks as cached in fallback environment', async () => {
    const url = 'https://example.com/new-icon.png'
    expect(isImageCached(url)).toBe(false)
    const result = await preloadImage(url)
    expect(result).toBe(url)
    expect(isImageCached(url)).toBe(true)
  })

  it('clears all cached URLs upon clearImageCache call', () => {
    markImageCached('https://example.com/1.png')
    markImageCached('https://example.com/2.png')
    expect(isImageCached('https://example.com/1.png')).toBe(true)
    clearImageCache()
    expect(isImageCached('https://example.com/1.png')).toBe(false)
    expect(isImageCached('https://example.com/2.png')).toBe(false)
  })
})
