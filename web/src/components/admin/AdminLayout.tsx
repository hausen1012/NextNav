import { useState, useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { useHome, useMe } from '@/lib/query'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminLayout() {
  const { data: me, isLoading: meLoading } = useMe()
  const { data: home } = useHome()

  // Remember sidebar collapse state in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('nextnav_admin_sidebar_collapsed') === '1'
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('nextnav_admin_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

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
    <div className='flex min-h-screen bg-background'>
      {/* Desktop sidebar */}
      <div className='hidden md:flex'>
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          siteName={home?.site.name ?? 'NextNav'}
        />
      </div>

      {/* Mobile drawer backdrop and sidebar */}
      {mobileMenuOpen && (
        <div className='fixed inset-0 z-50 md:hidden flex'>
          <div
            className='fixed inset-0 bg-background/80 backdrop-blur-xs'
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className='relative z-50 flex h-full w-64 max-w-[80vw] flex-col bg-sidebar shadow-xl'>
            <AdminSidebar
              collapsed={false}
              onToggleCollapse={() => setMobileMenuOpen(false)}
              siteName={home?.site.name ?? 'NextNav'}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <AdminHeader
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          me={me}
        />
        <main className='flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-muted/15'>
          <div className='mx-auto max-w-6xl space-y-6'>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
