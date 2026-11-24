import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Menu,
  Moon,
  Sun,
  ExternalLink,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { api } from '@/lib/api'
import type { MeResponse } from '@/lib/api'

interface AdminHeaderProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleMobileMenu: () => void
  me?: MeResponse
}

const routeTitleMap: Record<string, string> = {
  '/admin': '概览看板',
  '/admin/categories': '分类管理',
  '/admin/links': '书签管理',
  '/admin/settings': '站点设置',
  '/admin/account': '账户安全',
  '/admin/system': '运维维护',
}

export function AdminHeader({
  collapsed,
  onToggleCollapse,
  onToggleMobileMenu,
  me,
}: AdminHeaderProps) {
  const location = useLocation()
  const [theme, setThemeState] = useState<Theme>(getTheme())

  const currentPath = location.pathname
  const currentPageTitle = routeTitleMap[currentPath] || '管理后台'

  return (
    <header className='sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur'>
      <div className='flex items-center gap-3'>
        {/* Mobile menu button */}
        <Button
          variant='ghost'
          size='icon'
          className='md:hidden size-8'
          onClick={onToggleMobileMenu}
          aria-label='展开移动端菜单'
        >
          <Menu className='size-4' />
        </Button>

        {/* Desktop sidebar toggle button */}
        <Button
          variant='ghost'
          size='icon'
          className='hidden md:flex size-8 text-muted-foreground hover:text-foreground'
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
        </Button>

        {/* Breadcrumb */}
        <Breadcrumb className='hidden sm:block'>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to='/admin'>管理后台</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {currentPath !== '/admin' && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right actions */}
      <div className='flex items-center gap-2'>
        <Button variant='outline' size='sm' className='gap-1.5 h-8 text-xs' asChild>
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

        {/* User avatar / menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='h-8 gap-2 px-2 text-xs'>
              <div className='flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs'>
                {me?.username ? me.username.slice(0, 1).toUpperCase() : <User className='size-3.5' />}
              </div>
              <span className='hidden md:inline font-medium'>{me?.username || '管理员'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48'>
            <DropdownMenuLabel>
              <p className='text-xs font-normal text-muted-foreground'>已登录为</p>
              <p className='truncate font-medium text-sm'>{me?.username || '管理员'}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to='/admin/account' className='cursor-pointer'>
                <User className='mr-2 size-4' />
                <span>账户设置</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/' className='cursor-pointer'>
                <ExternalLink className='mr-2 size-4' />
                <span>访问前台</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='cursor-pointer text-destructive focus:text-destructive'
              onClick={async () => {
                await api.logout()
                window.location.href = '/'
              }}
            >
              <LogOut className='mr-2 size-4' />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
