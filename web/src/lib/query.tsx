import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, type ReactNode } from 'react'
import { ApiError, api } from './api'
import {
  getCacheSnapshot,
  invalidatePwaData,
  observeSession,
  resetPwaCache,
  type CacheUpdateDetail,
} from './pwa-cache'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status < 500) return false
        return count < 2
      },
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const refresh = () => {
      void queryClient.cancelQueries({ queryKey: ['home'] })
      void queryClient.cancelQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['home'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    }
    const update = (event: Event) => {
      const { path, data } = (event as CustomEvent<CacheUpdateDetail>).detail
      if (path === '/api/home') queryClient.setQueryData(['home'], data)
      if (path === '/api/me') queryClient.setQueryData(['me'], data)
    }

    window.addEventListener('nextnav-cache-state', refresh)
    window.addEventListener('nextnav-cache-updated', update)
    return () => {
      window.removeEventListener('nextnav-cache-state', refresh)
      window.removeEventListener('nextnav-cache-updated', update)
    }
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const requestState = getCacheSnapshot()
      const me = await api.me()
      const current = getCacheSnapshot()
      if (current.scope === requestState.scope && current.epoch === requestState.epoch) {
        await observeSession(me)
      }
      return me
    },
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
}

export function useHome() {
  return useQuery({
    queryKey: ['home'],
    queryFn: api.home,
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
}

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    enabled,
    refetchOnWindowFocus: enabled,
  })
}

export function useFetchSettings(enabled = true) {
  return useQuery({
    queryKey: ['fetch-settings'],
    queryFn: api.fetchSettings,
    enabled,
    refetchOnWindowFocus: enabled,
  })
}

export function useSecuritySettings() {
  return useQuery({
    queryKey: ['security-settings'],
    queryFn: api.securitySettings,
    select: (data) => data.security,
    refetchOnWindowFocus: 'always',
  })
}

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin-categories'],
    queryFn: api.adminCategories,
    refetchOnWindowFocus: 'always',
  })
}

export function useAdminLinks() {
  return useQuery({
    queryKey: ['admin-links'],
    queryFn: api.adminLinks,
    refetchOnWindowFocus: 'always',
  })
}

export function useCheckStatus(polling = false) {
  return useQuery({
    queryKey: ['check-status'],
    queryFn: api.getCheckStatus,
    refetchInterval: (query) => {
      return query.state.data?.running || polling ? 1000 : false
    },
  })
}

export async function clearSessionCache() {
  await resetPwaCache('public', 0, false)
  await invalidateSession()
}

const ADMIN_QUERY_KEYS = [['settings'], ['fetch-settings'], ['security-settings'], ['admin-categories'], ['admin-links']] as const

export function useInvalidateNavigationData() {
  const qc = useQueryClient()
  return useCallback(() => {
    ADMIN_QUERY_KEYS.forEach((queryKey) => void qc.invalidateQueries({ queryKey }))
    void qc.cancelQueries({ queryKey: ['home'] })
    return invalidatePwaData(false).then(() => {
      void qc.invalidateQueries({ queryKey: ['home'] })
    })
  }, [qc])
}

// 仅触发后台校验，保留已有缓存，服务不可用时仍能展示已缓存数据。
export function useRefreshNavigationData() {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.cancelQueries({ queryKey: ['home'] })
    return qc.invalidateQueries({ queryKey: ['home'] })
  }, [qc])
}

export async function invalidateSession() {
  void queryClient.cancelQueries({ queryKey: ['me'] })
  await queryClient.invalidateQueries({ queryKey: ['me'] })
}
