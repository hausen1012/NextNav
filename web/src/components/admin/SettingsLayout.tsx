import { NavLink, Outlet } from 'react-router-dom'
import { Globe, ShieldCheck, SlidersHorizontal, Wrench } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const settingsNav = [
  { title: '基础设置', url: '/admin/settings', icon: Globe, end: true },
  { title: '网络请求', url: '/admin/settings/fetch', icon: SlidersHorizontal },
  { title: '账户与令牌', url: '/admin/settings/account', icon: ShieldCheck },
  { title: '运维维护', url: '/admin/settings/maintenance', icon: Wrench },
]

/** 设置容器：统一页头与二级导航，子页面通过 Outlet 渲染。 */
export function SettingsLayout() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>系统设置</h1>
        <p className='text-sm text-muted-foreground'>管理站点配置、显示偏好与管理员账户。</p>
      </div>

      <Separator />

      <div className='flex flex-col gap-8 lg:flex-row lg:gap-12'>
        <nav aria-label='设置导航' className='flex gap-1 overflow-x-auto pb-1 lg:w-44 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0'>
          {settingsNav.map(({ title, url, icon: Icon, end }) => (
            <NavLink
              key={url}
              to={url}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <Icon className='size-4 shrink-0' />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>

        <div className='min-w-0 flex-1'>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
