import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type CacheScope = 'public' | 'private'

export interface CacheState {
  scope: CacheScope
  expiresAt: number
  epoch: number
  updatedAt: number
}

export interface CacheMetadata {
  scope: CacheScope
  expiresAt: number
  epoch: number
  cachedAt: number
}

export const CACHE_NAMES = {
  public: 'nextnav-api-public-v1',
  private: 'nextnav-api-private-v1',
  icons: 'nextnav-icons-v1',
} as const

export const LEGACY_CACHE_NAMES = ['api-home-cache', 'api-me-cache', 'site-icons-cache']

export const CACHE_HEADERS = {
  requestScope: 'X-NextNav-Cache-Scope',
  requestEpoch: 'X-NextNav-Cache-Epoch',
  hit: 'X-NextNav-Cache',
  epoch: 'X-NextNav-Cache-Epoch',
  expiresAt: 'X-NextNav-Cache-Expires-At',
  cachedAt: 'X-NextNav-Cache-Cached-At',
} as const

export const CACHE_MESSAGES = {
  reset: 'NEXTNAV_CACHE_RESET',
  observeSession: 'NEXTNAV_CACHE_OBSERVE_SESSION',
  updated: 'NEXTNAV_CACHE_UPDATED',
  invalidated: 'NEXTNAV_CACHE_INVALIDATED',
} as const

export const PUBLIC_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function normalizeExpiry(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

export function defaultCacheState(): CacheState {
  return { scope: 'public', expiresAt: 0, epoch: 0, updatedAt: 0 }
}

export function isCacheMetadataUsable(metadata: CacheMetadata, now = Date.now()): boolean {
  return (
    (metadata.scope === 'public' || metadata.scope === 'private') &&
    Number.isFinite(metadata.expiresAt) &&
    metadata.expiresAt > now &&
    Number.isFinite(metadata.cachedAt) &&
    metadata.cachedAt > 0 &&
    Number.isFinite(metadata.epoch) &&
    metadata.epoch >= 0
  )
}

export function canServeCachedData(
  metadata: CacheMetadata,
  state: CacheState,
  now = Date.now(),
): boolean {
  if (!isCacheMetadataUsable(metadata, now)) return false
  return metadata.scope === 'public' || (
    state.scope === 'private' &&
    state.expiresAt > now &&
    metadata.epoch === state.epoch
  )
}

export function shouldCacheApiResponse(path: string, scope: CacheScope): boolean {
  return path === '/api/home' || (path === '/api/me' && scope === 'private')
}

export function collectPublicIconUrls(value: unknown, urls: Set<string>) {
  if (typeof value === 'string') {
    if (value.startsWith('/icons/') || value.startsWith('/api/favicon/')) urls.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPublicIconUrls(item, urls))
    return
  }
  if (value && typeof value === 'object') {
    if ('isPrivate' in value && value.isPrivate === true) return
    Object.values(value).forEach((item) => collectPublicIconUrls(item, urls))
  }
}

interface NextNavDB extends DBSchema {
  state: {
    key: string
    value: CacheState
  }
}

let database: Promise<IDBPDatabase<NextNavDB>> | undefined

function getDatabase() {
  database ??= openDB<NextNavDB>('nextnav-pwa-cache', 1, {
    upgrade(db) {
      db.createObjectStore('state')
    },
  })
  return database
}

export async function getCacheState(): Promise<CacheState> {
  const db = await getDatabase()
  return (await db.get('state', 'current')) ?? defaultCacheState()
}

export async function setCacheState(state: CacheState): Promise<void> {
  const db = await getDatabase()
  await db.put('state', state, 'current')
}
