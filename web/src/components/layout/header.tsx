import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'

const routeTitleMap: Record<string, string> = {
  '/admin': '概览看板',
  '/admin/categories': '分类管理',
  '/admin/links': '链接管理',
  '/admin/settings': '站点设置',
  '/admin/account': '账户安全',
  '/admin/system': '运维维护',
}

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean
}

export function Header({ className, fixed = true, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const location = useLocation()
  const currentPath = location.pathname
  const currentPageTitle = routeTitleMap[currentPath] || '管理后台'

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
        {/* Left: SidebarTrigger & Breadcrumb */}
        <div className='flex items-center gap-3'>
          <SidebarTrigger variant='outline' className='max-md:scale-110 size-8' />
          <Separator orientation='vertical' className='h-5' />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className='hidden md:block'>
                <BreadcrumbLink asChild>
                  <Link to='/admin'>管理后台</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {currentPath !== '/admin' && (
                <>
                  <BreadcrumbSeparator className='hidden md:block' />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentPageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
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
        </div>
      </div>
    </header>
  )
}
