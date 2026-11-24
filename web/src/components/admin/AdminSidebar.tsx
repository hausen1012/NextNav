import { NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderTree,
  Bookmark,
  SlidersHorizontal,
  ShieldCheck,
  Wrench,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Compass,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const mainNavItems: NavItem[] = [
  { title: '概览看板', href: '/admin', icon: LayoutDashboard },
  { title: '分类管理', href: '/admin/categories', icon: FolderTree },
  { title: '书签管理', href: '/admin/links', icon: Bookmark },
]

const settingsNavItems: NavItem[] = [
  { title: '站点设置', href: '/admin/settings', icon: SlidersHorizontal },
  { title: '账户安全', href: '/admin/account', icon: ShieldCheck },
  { title: '运维维护', href: '/admin/system', icon: Wrench },
]

interface AdminSidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  siteName: string
}

export function AdminSidebar({ collapsed, onToggleCollapse, siteName }: AdminSidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 select-none',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Brand / Logo */}
        <div className='flex h-14 items-center justify-between px-3.5 border-b'>
          <Link
            to='/admin'
            className={cn(
              'flex items-center gap-2.5 font-semibold text-sm tracking-tight overflow-hidden transition-all',
              collapsed && 'justify-center w-full px-0'
            )}
            title={siteName ? `${siteName} 管理后台` : 'NextNav 管理后台'}
          >
            <div className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
              <Compass className='size-4' />
            </div>
            {!collapsed && (
              <div className='flex flex-col truncate leading-tight'>
                <span className='truncate font-medium text-foreground'>{siteName || 'NextNav'}</span>
                <span className='text-[11px] text-muted-foreground'>管理控制台</span>
              </div>
            )}
          </Link>
        </div>

        {/* Nav lists */}
        <div className='flex-1 overflow-y-auto px-2 py-3 space-y-4'>
          {/* Main group */}
          <div>
            {!collapsed && (
              <p className='px-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase'>
                导航与内容
              </p>
            )}
            <nav className='space-y-1'>
              {mainNavItems.map((item) => {
                const Icon = item.icon
                const content = (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === '/admin'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        collapsed && 'justify-center px-0 size-10'
                      )
                    }
                  >
                    <Icon className='size-4 shrink-0' />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                )

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side='right'>{item.title}</TooltipContent>
                    </Tooltip>
                  )
                }

                return content
              })}
            </nav>
          </div>

          <Separator className='opacity-50' />

          {/* Settings group */}
          <div>
            {!collapsed && (
              <p className='px-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase'>
                系统与配置
              </p>
            )}
            <nav className='space-y-1'>
              {settingsNavItems.map((item) => {
                const Icon = item.icon
                const content = (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        collapsed && 'justify-center px-0 size-10'
                      )
                    }
                  >
                    <Icon className='size-4 shrink-0' />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                )

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{content}</TooltipTrigger>
                      <TooltipContent side='right'>{item.title}</TooltipContent>
                    </Tooltip>
                  )
                }

                return content
              })}
            </nav>
          </div>
        </div>

        {/* Footer items */}
        <div className='border-t p-2 space-y-1'>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='ghost' size='icon' className='size-10 w-full' asChild>
                  <Link to='/'>
                    <ExternalLink className='size-4' />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side='right'>返回前台导航</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant='ghost' size='sm' className='w-full justify-start gap-2.5 text-xs text-muted-foreground' asChild>
              <Link to='/'>
                <ExternalLink className='size-3.5' />
                <span>返回前台导航</span>
              </Link>
            </Button>
          )}

          <Button
            variant='ghost'
            size='sm'
            onClick={onToggleCollapse}
            className={cn(
              'w-full text-xs text-muted-foreground hover:text-foreground',
              collapsed ? 'size-10 px-0' : 'justify-between px-3'
            )}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {!collapsed && <span>折叠侧边栏</span>}
            {collapsed ? <ChevronRight className='size-4' /> : <ChevronLeft className='size-4' />}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
