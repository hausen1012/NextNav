import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Moon, Sun, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { UserNav } from './user-nav'
import type { MeResponse } from '@/lib/api'

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean
  me?: MeResponse
}

export function Header({ className, fixed = true, me, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)
  const [theme, setThemeState] = useState<Theme>(getTheme())

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow-xs' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full items-center justify-between gap-3 px-4 sm:gap-4',
          offset > 10 &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/80 after:backdrop-blur-lg'
        )}
      >
        {/* Left: SidebarTrigger */}
        <div className='flex items-center gap-3'>
          <SidebarTrigger variant='outline' className='max-md:scale-110 size-8' />
        </div>

        {/* Right: Actions */}
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' className='h-8 gap-1.5 text-xs' asChild>
            <Link to='/' target='_blank' rel='noopener noreferrer'>
              <ExternalLink className='size-3.5' />
              <span className='hidden sm:inline'>预览前台</span>
            </Link>
          </Button>

          <Button
            variant='ghost'
            size='icon'
            className='size-8'
            onClick={() => {
              toggleTheme()
              setThemeState(getTheme())
            }}
            aria-label='切换颜色模式'
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <Sun className='size-4' /> : <Moon className='size-4' />}
          </Button>

          <UserNav me={me} />
        </div>
      </div>
    </header>
  )
}
