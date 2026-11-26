import { describe, expect, it } from 'vitest'
import {
  canServeCachedData,
  collectPublicIconUrls,
  defaultCacheState,
  isCacheMetadataUsable,
  normalizeExpiry,
  shouldCacheApiResponse,
  type CacheMetadata,
  type CacheState,
} from './cache-store'

const now = 1_800_000_000_000

function metadata(overrides: Partial<CacheMetadata> = {}): CacheMetadata {
  return {
    scope: 'private',
    expiresAt: now + 60_000,
    epoch: 3,
    cachedAt: now - 1000,
    ...overrides,
  }
}

function state(overrides: Partial<CacheState> = {}): CacheState {
  return {
    scope: 'private',
    expiresAt: now + 60_000,
    epoch: 3,
    updatedAt: now - 1000,
    ...overrides,
  }
}

describe('PWA 缓存有效性', () => {
  it('允许未到期的私有缓存', () => {
    expect(canServeCachedData(metadata(), state(), now)).toBe(true)
  })

  it('会话到期后拒绝私有缓存', () => {
    const expired = metadata({ expiresAt: now })
    expect(isCacheMetadataUsable(expired, now)).toBe(false)
    expect(canServeCachedData(expired, state(), now)).toBe(false)
    expect(canServeCachedData(metadata(), state({ expiresAt: now }), now)).toBe(false)
  })

  it('退出或轮换 epoch 后拒绝私有缓存', () => {
    expect(canServeCachedData(metadata(), state({ scope: 'public' }), now)).toBe(false)
    expect(canServeCachedData(metadata(), state({ epoch: 4 }), now)).toBe(false)
  })

  it('公开缓存可跨会话使用且仍受有效期约束', () => {
    const publicMetadata = metadata({ scope: 'public', epoch: 0, expiresAt: now + 1 })
    expect(canServeCachedData(publicMetadata, state({ scope: 'public', epoch: 9 }), now)).toBe(true)
    expect(canServeCachedData({ ...publicMetadata, expiresAt: now }, state(), now)).toBe(false)
  })

  it('拒绝损坏或来源不明的缓存元数据', () => {
    expect(isCacheMetadataUsable(metadata({ cachedAt: 0 }), now)).toBe(false)
    expect(isCacheMetadataUsable(metadata({ epoch: -1 }), now)).toBe(false)
    expect(isCacheMetadataUsable(metadata({ expiresAt: Number.NaN }), now)).toBe(false)
    expect(defaultCacheState()).toEqual({ scope: 'public', expiresAt: 0, epoch: 0, updatedAt: 0 })
  })

  it('只缓存导航数据和私有身份', () => {
    expect(shouldCacheApiResponse('/api/home', 'public')).toBe(true)
    expect(shouldCacheApiResponse('/api/home', 'private')).toBe(true)
    expect(shouldCacheApiResponse('/api/me', 'private')).toBe(true)
    expect(shouldCacheApiResponse('/api/me', 'public')).toBe(false)
  })

  it('将服务端秒级到期时间转换为毫秒', () => {
    const seconds = Math.floor(now / 1000)
    expect(normalizeExpiry(seconds)).toBe(seconds * 1000)
    expect(normalizeExpiry(now)).toBe(now)
    expect(normalizeExpiry(0)).toBe(0)
    expect(normalizeExpiry(Number.NaN)).toBe(0)
  })

  it('清理私有缓存时保留公开导航图标', () => {
    const urls = new Set<string>()
    collectPublicIconUrls({
      site: { logoUrl: '/icons/site.png' },
      groups: [{
        isPrivate: false,
        links: [
          { isPrivate: false, iconUrl: '/icons/public.png' },
          { isPrivate: true, iconUrl: '/icons/private.png' },
        ],
      }],
    }, urls)
    expect([...urls].sort()).toEqual(['/icons/public.png', '/icons/site.png'])
  })
})
