import { Link } from 'react-router-dom'
import { LayoutDashboard, FolderTree, Link2, SlidersHorizontal } from 'lucide-react'
import { Logo } from '@/components/Logo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useLayout } from '@/context/layout-provider'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import type { NavGroup as NavGroupType } from './types'
import type { MeResponse } from '@/lib/api'

interface AppSidebarProps {
  siteName: string
  me?: MeResponse
}

const navGroups: NavGroupType[] = [
  {
    title: '导航与内容',
    items: [
      { title: '概览看板', url: '/admin', icon: LayoutDashboard },
      { title: '分类管理', url: '/admin/categories', icon: FolderTree },
      { title: '链接管理', url: '/admin/links', icon: Link2 },
    ],
  },
  {
    title: '系统与配置',
    items: [
      { title: '系统设置', url: '/admin/settings', icon: SlidersHorizontal },
    ],
  },
]

export function AppSidebar({ siteName, me }: AppSidebarProps) {
  const { collapsible, variant } = useLayout()

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      {/* Brand Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild tooltip={siteName || 'NextNav'} className='group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center'>
              <Link to='/admin' className='flex items-center gap-2 group-data-[collapsible=icon]:justify-center'>
                <Logo className='size-8' />
                <div className='grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                  <span className='truncate font-semibold'>{siteName || 'NextNav'}</span>
                  <span className='truncate text-xs text-muted-foreground'>管理控制台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation Groups */}
      <SidebarContent>
        {navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>

      {/* Footer User */}
      <SidebarFooter>
        <NavUser me={me} />
      </SidebarFooter>

      {/* Rail */}
      <SidebarRail />
    </Sidebar>
  )
}
