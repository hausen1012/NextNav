import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMe, clearSessionCache } from '@/lib/query'
import { invalidatePwaData } from '@/lib/pwa-cache'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import { Moon, Sun, LayoutDashboard, LogOut, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Header({ siteName }: { siteName: string }) {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await invalidatePwaData()
      await Promise.all([
        qc.refetchQueries({ queryKey: ['home'] }),
        qc.refetchQueries({ queryKey: ['me'] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    document.title = siteName || 'NextNav'
  }, [siteName])

  return (
    <header className='sticky top-0 z-20 border-b bg-background/85 backdrop-blur'>
      <div className='mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4'>
        <Link to='/' className='flex items-center gap-2.5 text-lg font-semibold tracking-tight'>
          <Logo className='size-7' />
          <span>{siteName || 'NextNav'}</span>
        </Link>
        <div className='flex-1' />
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label='刷新导航数据'
          title='刷新导航数据'
        >
          <RotateCw className={cn('size-4', refreshing && 'animate-spin')} />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          onClick={() => {
            toggleTheme()
            setThemeState(getTheme())
          }}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? <Sun className='size-4' /> : <Moon className='size-4' />}
        </Button>
        {me?.auth === 'admin' ? (
          <>
            <Button variant='default' size='sm' className='gap-1.5' asChild>
              <Link to='/admin'>
                <LayoutDashboard className='size-3.5' />
                <span>管理后台</span>
              </Link>
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={async () => {
                await api.logout()
                await clearSessionCache()
                window.location.href = '/'
              }}
              title='退出登录'
            >
              <LogOut className='size-3.5' />
              <span className='hidden sm:inline'>退出</span>
            </Button>
          </>
        ) : (
          <Button variant='outline' size='sm' asChild>
            <Link to='/login'>登录</Link>
          </Button>
        )}
      </div>
    </header>
  )
}
