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
  return useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 })
}

export function useHome() {
  return useQuery({ queryKey: ['home'], queryFn: api.home })
}

export function useInvalidateHome() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['home'] })
    void qc.invalidateQueries({ queryKey: ['me'] })
  }
}