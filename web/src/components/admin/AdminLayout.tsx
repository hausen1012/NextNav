import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useHome, useMe } from '@/lib/query'
import { type MeResponse } from '@/lib/api'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminLayout() {
  const location = useLocation()
  const { data: me, isLoading: meLoading } = useMe()

  if (meLoading) {
    return (
      <div className='flex h-screen w-full items-center justify-center p-6'>
        <div className='w-full max-w-sm space-y-3'>
          <Skeleton className='h-8 w-3/4' />
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-10 w-1/2' />
        </div>
      </div>
    )
  }

  if (me?.auth !== 'admin') {
    return (
      <Navigate
        to={`/sign-in?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  return <AdminShell me={me} />
}

function AdminShell({ me }: { me: MeResponse }) {
  const { data: home } = useHome()
  const defaultOpen = getCookie('sidebar_state') !== 'false'

  return (
    <LayoutProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar siteName={home?.site.name ?? 'NextNav'} me={me} />
        <SidebarInset
          className={cn(
            '@container/content',
            'peer-data-[variant=inset]:min-h-[calc(100svh-1rem)]'
          )}
        >
          <Header me={me} />
          <Main>
            <Outlet />
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  )
}
