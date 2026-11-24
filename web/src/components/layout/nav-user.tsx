import { Link } from 'react-router-dom'
import {
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  User,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { api, type MeResponse } from '@/lib/api'
import { clearHomeCache } from '@/lib/query'

interface NavUserProps {
  me?: MeResponse
}

export function NavUser({ me }: NavUserProps) {
  const { isMobile } = useSidebar()
  const username = me?.username || '管理员'
  const initial = username.slice(0, 1).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              tooltip={username}
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center'
            >
              <div className='flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs'>
                {initial}
              </div>
              <div className='grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                <span className='truncate font-medium'>{username}</span>
                <span className='truncate text-xs text-muted-foreground'>系统管理员</span>
              </div>
              <ChevronsUpDown className='ms-auto size-4 group-data-[collapsible=icon]:hidden' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            side={isMobile ? 'bottom' : 'right'}
            align='end'
            sideOffset={4}
          >
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs'>
                  {initial}
                </div>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-medium'>{username}</span>
                  <span className='truncate text-xs text-muted-foreground'>系统管理员</span>
                </div>
              </div>
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
                await clearHomeCache()
                window.location.href = '/'
              }}
            >
              <LogOut className='mr-2 size-4' />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
