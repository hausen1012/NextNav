/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import {
  CACHE_HEADERS,
  CACHE_MESSAGES,
  CACHE_NAMES,
  LEGACY_CACHE_NAMES,
  PUBLIC_CACHE_TTL_MS,
  canServeCachedData,
  collectPublicIconUrls,
  defaultCacheState,
  getCacheState,
  isCacheMetadataUsable,
  normalizeExpiry,
  setCacheState,
  shouldCacheApiResponse,
  type CacheMetadata,
  type CacheScope,
  type CacheState,
} from './lib/cache-store'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

const dataScopeHeader = 'X-NextNav-Data-Scope'
const sessionExpiryHeader = 'X-NextNav-Session-Expires-At'
const networkRequests = new Map<string, Promise<Response>>()
let stateQueue: Promise<unknown> = Promise.resolve()

function readState() {
  const operation = stateQueue.then(() => getCacheState())
  stateQueue = operation.catch(() => undefined)
  return operation
}

function updateState<T>(operation: () => Promise<T>): Promise<T> {
  const result = stateQueue.then(operation)
  stateQueue = result.catch(() => undefined)
  return result
}

function cacheKey(path: string) {
  return new Request(new URL(path, self.location.origin), { credentials: 'same-origin' })
}

function parseMetadata(response: Response): CacheMetadata | null {
  const scope = response.headers.get(dataScopeHeader)
  if (scope !== 'public' && scope !== 'private') return null
  const metadata: CacheMetadata = {
    scope,
    expiresAt: Number(response.headers.get(CACHE_HEADERS.expiresAt)),
    epoch: Number(response.headers.get(CACHE_HEADERS.epoch)),
    cachedAt: Number(response.headers.get(CACHE_HEADERS.cachedAt)),
  }
  return isCacheMetadataUsable(metadata) ? metadata : null
}

function withCacheHeaders(response: Response, metadata: CacheMetadata, hit: boolean) {
  const headers = new Headers(response.headers)
  headers.set(CACHE_HEADERS.hit, hit ? 'hit' : 'miss')
  headers.set(CACHE_HEADERS.epoch, String(metadata.epoch))
  headers.set(CACHE_HEADERS.expiresAt, String(metadata.expiresAt))
  headers.set(CACHE_HEADERS.cachedAt, String(metadata.cachedAt))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function requestWithState(request: Request, state: CacheState) {
  const headers = new Headers(request.headers)
  headers.set(CACHE_HEADERS.requestScope, state.scope)
  headers.set(CACHE_HEADERS.requestEpoch, String(state.epoch))
  headers.set('Cache-Control', 'no-cache')
  return new Request(request, { headers })
}

async function clearPrivateCache() {
  const publicCache = await caches.open(CACHE_NAMES.public)
  const privateCache = await caches.open(CACHE_NAMES.private)
  const iconPaths = new Set<string>()
  for (const cache of [publicCache, privateCache]) {
    const home = await cache.match(cacheKey('/api/home'))
    if (!home) continue
    try {
      collectPublicIconUrls(await home.clone().json(), iconPaths)
    } catch {
      // 单个缓存损坏时仍可清理其余数据。
    }
  }
  const publicIcons = new Set(
    [...iconPaths].map((path) => new URL(path, self.location.origin).href),
  )
  await caches.delete(CACHE_NAMES.private)

  const iconCache = await caches.open(CACHE_NAMES.icons)
  for (const request of await iconCache.keys()) {
    const url = new URL(request.url)
    if (
      url.origin === self.location.origin &&
      (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/api/favicon/')) &&
      !publicIcons.has(request.url)
    ) {
      await iconCache.delete(request)
    }
  }
}

async function notifyClients(message: unknown) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

async function notifyInvalidated(state: CacheState) {
  await notifyClients({ type: CACHE_MESSAGES.invalidated, state })
}

async function invalidatePrivateState() {
  return updateState(async () => {
    const current = await getCacheState()
    const state: CacheState = {
      scope: 'public',
      expiresAt: 0,
      epoch: current.epoch + 1,
      updatedAt: Date.now(),
    }
    await clearPrivateCache()
    await setCacheState(state)
    await notifyInvalidated(state)
    return state
  })
}

interface CachedLookup {
  response: Response | null
  state: CacheState
}

async function findCachedResponse(path: string, state: CacheState): Promise<CachedLookup> {
  const scopes: CacheScope[] = state.scope === 'private'
    ? path === '/api/home'
      ? ['private', 'public']
      : ['private']
    : ['public']

  for (const scope of scopes) {
    const cache = await caches.open(CACHE_NAMES[scope])
    if (scope === 'public' && path === '/api/me') {
      await cache.delete(cacheKey(path))
      continue
    }
    const response = await cache.match(cacheKey(path))
    if (!response) continue
    const metadata = parseMetadata(response)
    const usable =
      metadata?.scope === scope &&
      canServeCachedData(metadata, state)

    if (usable && metadata) {
      return { response: withCacheHeaders(response, metadata, true), state }
    }

    await cache.delete(cacheKey(path))
    if (metadata?.scope === 'private' && metadata.expiresAt <= Date.now() && state.scope === 'private') {
      const nextState = await invalidatePrivateState()
      return findCachedResponse(path, nextState)
    }
  }

  return { response: null, state }
}

async function processNetworkResponse(
  response: Response,
  path: string,
  requestState: CacheState,
): Promise<Response> {
  if (response.status === 401) {
    await invalidatePrivateState()
    return response
  }

  const scope = response.headers.get(dataScopeHeader)
  if (
    response.status !== 200 ||
    response.type === 'opaque' ||
    (scope !== 'public' && scope !== 'private')
  ) {
    return response
  }

  const now = Date.now()
  const sessionExpiry = normalizeExpiry(Number(response.headers.get(sessionExpiryHeader)))
  const expiresAt = scope === 'private' ? sessionExpiry : now + PUBLIC_CACHE_TTL_MS
  if (scope === 'private' && (!Number.isFinite(expiresAt) || expiresAt <= now)) return response

  let data: unknown
  try {
    data = await response.clone().json()
  } catch {
    return response
  }

  return updateState(async () => {
    const current = await getCacheState()
    if (current.epoch !== requestState.epoch) return Response.error()

    let state = current
    if (scope === 'private') {
      if (current.scope !== 'private' || current.expiresAt !== expiresAt) {
        state = { ...current, scope: 'private', expiresAt, updatedAt: now }
        await setCacheState(state)
        if (current.scope !== 'private') await notifyInvalidated(state)
      }
    } else if (current.scope === 'private') {
      state = {
        scope: 'public',
        expiresAt: 0,
        epoch: current.epoch + 1,
        updatedAt: now,
      }
      await clearPrivateCache()
      await setCacheState(state)
      await notifyInvalidated(state)
    }

    let metadata: CacheMetadata | undefined
    if (shouldCacheApiResponse(path, scope)) {
      metadata = { scope, expiresAt, epoch: state.epoch, cachedAt: now }
      const cachedResponse = response.clone()
      const headers = new Headers(cachedResponse.headers)
      headers.set(CACHE_HEADERS.epoch, String(metadata.epoch))
      headers.set(CACHE_HEADERS.expiresAt, String(metadata.expiresAt))
      headers.set(CACHE_HEADERS.cachedAt, String(metadata.cachedAt))
      const cache = await caches.open(CACHE_NAMES[scope])
      await cache.put(cacheKey(path), new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      }))
    }

    await notifyClients({
      type: CACHE_MESSAGES.updated,
      path,
      data,
      scope,
      epoch: state.epoch,
    })
    return metadata ? withCacheHeaders(response, metadata, false) : response
  })
}

function fetchNetwork(request: Request, path: string, state: CacheState) {
  const key = `${path}:${state.scope}:${state.epoch}`
  const existing = networkRequests.get(key)
  if (existing) return existing

  const operation = fetch(request).then((response) => processNetworkResponse(response, path, state))
  networkRequests.set(key, operation)
  void operation.finally(() => networkRequests.delete(key)).catch(() => undefined)
  return operation
}

async function handleApiRequest({ event, request, url }: {
  event: ExtendableEvent
  request: Request
  url: URL
}) {
  const path = url.pathname
  const initialState = await readState()
  const state = initialState ?? defaultCacheState()
  const effectiveRequest = requestWithState(request, state)

  if (request.headers.has('Authorization')) return fetch(effectiveRequest)

  const cached = await findCachedResponse(path, state)
  const effectiveState = cached.state
  const alignedRequest = requestWithState(request, effectiveState)

  if (cached.response) {
    const fetchEvent = event as FetchEvent
    fetchEvent.waitUntil(fetchNetwork(alignedRequest, path, effectiveState).catch(() => undefined))
    return cached.response
  }

  try {
    return (await fetchNetwork(alignedRequest, path, effectiveState)).clone()
  } catch {
    return Response.error()
  }
}

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all(LEGACY_CACHE_NAMES.map((name) => caches.delete(name)))
    const publicCache = await caches.open(CACHE_NAMES.public)
    await publicCache.delete(cacheKey('/api/me'))
    const state = await getCacheState()
    if (state.scope === 'private' && state.expiresAt <= Date.now()) {
      await invalidatePrivateState()
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  const message = event.data as {
    type?: string
    state?: CacheState
    mode?: 'session' | 'data'
  } | undefined
  if (!message?.state) return
  const state = message.state

  if (message.type === CACHE_MESSAGES.reset) {
    event.waitUntil(updateState(async () => {
      const current = await getCacheState()
      if (
        state.epoch < current.epoch ||
        (state.epoch === current.epoch && state.updatedAt < current.updatedAt)
      ) return
      await setCacheState(state)
      if (message.mode === 'data') {
        await Promise.all([caches.delete(CACHE_NAMES.public), caches.delete(CACHE_NAMES.private)])
      } else {
        await clearPrivateCache()
      }
      await notifyInvalidated(state)
    }))
    return
  }

  if (message.type === CACHE_MESSAGES.observeSession) {
    event.waitUntil(updateState(async () => {
      const current = await getCacheState()
      if (
        state.epoch !== current.epoch ||
        state.updatedAt < current.updatedAt
      ) return
      await setCacheState(state)
    }))
  }
})

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api\//, /^\/icons\//, /^\/api\/favicon\//],
}))

registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    request.method === 'GET' &&
    (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/api/favicon/')),
  new CacheFirst({
    cacheName: CACHE_NAMES.icons,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: PUBLIC_CACHE_TTL_MS / 1000 }),
    ],
  }),
)

registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin &&
    request.method === 'GET' &&
    (url.pathname === '/api/home' || url.pathname === '/api/me') &&
    !url.searchParams.has('nocache'),
  handleApiRequest,
)
