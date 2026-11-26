import { clearImageCache } from './image-loader'
import {
  CACHE_HEADERS,
  CACHE_MESSAGES,
  CACHE_NAMES,
  defaultCacheState,
  getCacheState,
  normalizeExpiry,
  setCacheState,
  type CacheScope,
  type CacheState,
} from './cache-store'

export interface CacheUpdateDetail {
  path: string
  data: unknown
}

type ResetMode = 'session' | 'data'

const tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random()}`

let currentState = defaultCacheState()
let initialized = false
let initializing: Promise<void> | undefined
let expirationTimer: ReturnType<typeof setTimeout> | undefined
let channel: BroadcastChannel | undefined

function hasServiceWorker() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

async function getWorker() {
  if (!hasServiceWorker()) return undefined
  const registration = await navigator.serviceWorker.ready
  return registration.active ?? navigator.serviceWorker.controller ?? undefined
}

function postToWorker(message: unknown) {
  if (!hasServiceWorker()) return
  void getWorker().then((worker) => worker?.postMessage(message)).catch(() => undefined)
}

function broadcastState(state: CacheState) {
  channel?.postMessage({ source: tabId, state })
}

function dispatchStateChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nextnav-cache-state'))
  }
}

function scheduleExpiration() {
  if (expirationTimer) clearTimeout(expirationTimer)
  expirationTimer = undefined
  if (currentState.scope !== 'private') return

  const arm = () => {
    const remaining = currentState.expiresAt - Date.now()
    if (remaining <= 0) {
      void resetPwaCache('public')
      return
    }
    expirationTimer = setTimeout(arm, Math.min(remaining, 2_147_483_647))
  }
  arm()
}

async function applyState(state: CacheState, notify = true) {
  if (
    state.epoch < currentState.epoch ||
    (state.epoch === currentState.epoch && state.updatedAt < currentState.updatedAt)
  ) return
  const scopeChanged = currentState.scope !== state.scope
  currentState = state
  await setCacheState(state)
  if (scopeChanged) clearImageCache()
  scheduleExpiration()
  if (notify) dispatchStateChange()
}

async function clearLocalPrivateData() {
  if (typeof caches === 'undefined' || hasServiceWorker()) return
  try {
    await Promise.all([caches.delete(CACHE_NAMES.private), caches.delete(CACHE_NAMES.icons)])
  } catch {
    // 缓存不可用时仍允许页面继续使用。
  }
}

function handleWorkerMessage(event: MessageEvent) {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (message.type === CACHE_MESSAGES.updated) {
    if (message.epoch !== currentState.epoch || message.scope !== currentState.scope) return
    if (typeof message.path !== 'string') return
    const detail: CacheUpdateDetail = {
      path: message.path,
      data: message.data,
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<CacheUpdateDetail>('nextnav-cache-updated', { detail }))
    }
    return
  }

  if (message.type === CACHE_MESSAGES.invalidated) {
    const state = message.state as CacheState | undefined
    if (!state || state.epoch < currentState.epoch) return
    if (state.epoch === currentState.epoch && state.updatedAt < currentState.updatedAt) return
    void applyState(state)
  }
}

async function waitForServiceWorkerControl() {
  if (!hasServiceWorker() || navigator.serviceWorker.controller) return
  await Promise.race([
    new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ])
}

export async function initializePwaCache() {
  if (initialized) return
  if (initializing) return initializing

  initializing = (async () => {
    currentState = await getCacheState()
    if (currentState.scope === 'private' && currentState.expiresAt <= Date.now()) {
      currentState = {
        scope: 'public',
        expiresAt: 0,
        epoch: currentState.epoch + 1,
        updatedAt: Date.now(),
      }
      await setCacheState(currentState)
      await clearLocalPrivateData()
      clearImageCache()
      broadcastState(currentState)
      postToWorker({ type: CACHE_MESSAGES.reset, state: currentState, mode: 'session' })
    }

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('nextnav-pwa-cache')
      channel.addEventListener('message', (event: MessageEvent) => {
        const message = event.data as { source?: string; state?: CacheState } | undefined
        const state = message?.state
        if (!state || message?.source === tabId) return
        if (state.epoch < currentState.epoch) return
        if (state.epoch === currentState.epoch && state.updatedAt <= currentState.updatedAt) return
        void applyState(state)
      })
    }

    if (hasServiceWorker()) {
      navigator.serviceWorker.addEventListener('message', handleWorkerMessage)
    }
    scheduleExpiration()
    await waitForServiceWorkerControl()
    initialized = true
  })()

  return initializing
}

export function getCacheSnapshot() {
  return { scope: currentState.scope, epoch: currentState.epoch }
}

export function getCacheRequestHeaders(): Record<string, string> {
  return {
    [CACHE_HEADERS.requestScope]: currentState.scope,
    [CACHE_HEADERS.requestEpoch]: String(currentState.epoch),
  }
}

async function createResetState(scope: CacheScope, expiresAt: number, mode: ResetMode) {
  const latest = await getCacheState()
  const epoch = Math.max(currentState.epoch, latest.epoch) + 1
  return {
    state: {
      scope,
      expiresAt: scope === 'private' ? expiresAt : 0,
      epoch,
      updatedAt: Date.now(),
    } satisfies CacheState,
    mode,
  }
}

export async function resetPwaCache(scope: CacheScope = 'public', expiresAt = 0) {
  const reset = await createResetState(scope, expiresAt, 'session')
  await applyState(reset.state, false)
  await clearLocalPrivateData()
  clearImageCache()
  broadcastState(reset.state)
  postToWorker({ type: CACHE_MESSAGES.reset, ...reset })
  dispatchStateChange()
}

export async function startPrivateSession(expiresAt: number) {
  const expiry = normalizeExpiry(expiresAt)
  if (expiry <= Date.now()) {
    await resetPwaCache('public')
    return
  }
  await resetPwaCache('private', expiry)
}

export async function observeSession(session: { auth: string; authMethod?: string; expiresAt?: number }) {
  if (session.auth === 'admin' && session.authMethod === 'cookie' && session.expiresAt) {
    const expiry = normalizeExpiry(session.expiresAt)
    if (expiry <= Date.now()) {
      await resetPwaCache('public')
      return
    }
    if (currentState.scope !== 'private' || currentState.expiresAt !== expiry) {
      const state = { ...currentState, scope: 'private' as const, expiresAt: expiry, updatedAt: Date.now() }
      await applyState(state)
      broadcastState(state)
      postToWorker({ type: CACHE_MESSAGES.observeSession, state })
    }
    return
  }

  if (currentState.scope === 'private') await resetPwaCache('public')
}

export async function invalidatePwaData() {
  const reset = await createResetState(currentState.scope, currentState.expiresAt, 'data')
  await applyState(reset.state, false)
  if (typeof caches !== 'undefined') {
    try {
      await Promise.all([caches.delete(CACHE_NAMES.public), caches.delete(CACHE_NAMES.private)])
    } catch {
      // 缓存不可用时仍允许页面继续使用。
    }
  }
  clearImageCache()
  broadcastState(reset.state)
  postToWorker({ type: CACHE_MESSAGES.reset, ...reset })
  dispatchStateChange()
}
