import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useMe } from '@/lib/query'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Moon, Sun, LayoutDashboard, LogOut } from 'lucide-react'

export function Header({ siteName }: { siteName: string }) {
  const { data: me } = useMe()
  const [theme, setThemeState] = useState<Theme>(getTheme())

  useEffect(() => {
    document.title = siteName || 'NextNav'
  }, [siteName])

  return (
    <header className='sticky top-0 z-20 border-b bg-background/85 backdrop-blur'>
      <div className='mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4'>
        <Link to='/' className='text-lg font-semibold tracking-tight'>
          {siteName || 'NextNav'}
        </Link>
        <div className='flex-1' />
        <Button
          variant='ghost'
          size='icon'
          onClick={() => {
            toggleTheme()
            setThemeState(getTheme())
          }}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
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
