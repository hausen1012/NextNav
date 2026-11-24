import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { ApiError, api } from './api'

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
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60 * 60 * 1000 })
}

export function useHome() {
  return useQuery({ queryKey: ['home'], queryFn: api.home, staleTime: 60 * 60 * 1000 })
}

export async function clearAllApiCache() {
  if (typeof caches !== 'undefined') {
    try {
      await Promise.all([
        caches.delete('api-home-cache'),
        caches.delete('api-me-cache'),
      ])
    } catch {
      // 忽略不支持的环境
    }
  }
}

export const clearHomeCache = clearAllApiCache

export function useInvalidateHome() {
  const qc = useQueryClient()
  return () => {
    void clearAllApiCache().then(() => {
      void qc.invalidateQueries({ queryKey: ['home'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    })
  }
}