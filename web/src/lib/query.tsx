import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
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
  await resetPwaCache('public')
}

export function useInvalidateHome() {
  const qc = useQueryClient()
  return () => {
    void qc.cancelQueries({ queryKey: ['home'] })
    void qc.cancelQueries({ queryKey: ['me'] })
    void invalidatePwaData().then(() => {
      void qc.invalidateQueries({ queryKey: ['home'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    })
  }
}