import { Link } from 'react-router-dom'
import { ExternalLink, LogOut, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, type MeResponse } from '@/lib/api'
import { clearHomeCache, useMe } from '@/lib/query'

interface UserNavProps {
  me?: MeResponse
}

export function UserNav({ me: propMe }: UserNavProps) {
  const { data: queryMe } = useMe()
  const me = propMe ?? queryMe
  const username = me?.username || '管理员'
  const initial = username.slice(0, 1).toUpperCase()

  const handleLogout = async () => {
    await api.logout()
    await clearHomeCache()
    window.location.href = '/'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='relative flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs ring-1 ring-border outline-hidden hover:opacity-80 transition-opacity cursor-pointer'
          aria-label='用户菜单'
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-1'>
            <p className='text-sm font-medium leading-none'>{username}</p>
            <p className='text-xs leading-none text-muted-foreground'>系统管理员</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to='/admin/account' className='cursor-pointer'>
              <User className='mr-2 size-4' />
              <span>账户设置</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/' target='_blank' rel='noopener noreferrer' className='cursor-pointer'>
              <ExternalLink className='mr-2 size-4' />
              <span>访问前台</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='cursor-pointer text-destructive focus:text-destructive'
          onClick={handleLogout}
        >
          <LogOut className='mr-2 size-4' />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
