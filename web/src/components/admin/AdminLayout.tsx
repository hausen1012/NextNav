import { Outlet, Link } from 'react-router-dom'
import { useHome, useMe } from '@/lib/query'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminLayout() {
  const { data: me, isLoading: meLoading } = useMe()
  const { data: home } = useHome()
  const defaultOpen = getCookie('sidebar_state') !== 'false'

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
      <div className='flex min-h-screen items-center justify-center p-4 bg-muted/30'>
        <Card className='max-w-md w-full shadow-lg'>
          <CardContent className='pt-6 text-center space-y-4'>
            <div className='mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold'>
              !
            </div>
            <div>
              <h2 className='text-lg font-semibold'>需要管理员权限</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                请先以管理员账号登录后再访问管理后台。
              </p>
            </div>
            <div className='pt-2'>
              <Link
                to='/login'
                className='inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90'
              >
                前往登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
          <Header />
          <Main>
            <Outlet />
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  )
}
