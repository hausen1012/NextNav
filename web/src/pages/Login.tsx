import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Sun, Moon, ArrowLeft } from 'lucide-react'
import { type HomeResponse } from '@/lib/api'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { LoginForm } from '@/components/login-form'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const homeData = qc.getQueryData<HomeResponse>(['home'])

  const [theme, setThemeState] = useState<Theme>(getTheme())

  const siteName = homeData?.site.name || 'NextNav'
  const brandText = homeData?.site.brandText?.trim() ?? '极简个人导航系统'
  const redirectTo = searchParams.get('redirect') || '/'

  const handleToggleTheme = () => {
    toggleTheme()
    setThemeState(getTheme())
  }

  return (
    <div className='relative container grid min-h-svh max-w-none items-center justify-center p-4'>
      {/* 顶部辅助操作栏 */}
      <div className='absolute right-4 top-4 flex items-center gap-2 sm:right-8 sm:top-8'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-9 rounded-lg text-muted-foreground hover:text-foreground'
          onClick={handleToggleTheme}
          title={theme === 'dark' ? '切换至亮色模式' : '切换至暗色模式'}
        >
          {theme === 'dark' ? <Sun className='size-4' /> : <Moon className='size-4' />}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='gap-1.5 text-xs text-muted-foreground hover:text-foreground'
          asChild
        >
          <Link to='/'>
            <ArrowLeft className='size-3.5' />
            <span>返回首页</span>
          </Link>
        </Button>
      </div>

      {/* 登录主体 */}
      <div className='mx-auto flex w-full flex-col justify-center space-y-4 py-8 sm:w-[380px]'>
        {/* 品牌标识 */}
        <div className='mb-2 flex items-center justify-center gap-2.5'>
          <Logo src={homeData?.site.logoUrl} className='size-8' />
          <h1 className='text-xl font-medium tracking-tight text-foreground'>
            {siteName}
          </h1>
        </div>

        {/* 登录卡片 */}
        <Card className='max-w-sm gap-4 shadow-sm sm:w-[380px]'>
          <CardHeader className='space-y-1 text-center'>
            <CardTitle className='text-lg font-semibold tracking-tight'>登录</CardTitle>
            <CardDescription className='text-sm text-muted-foreground'>
              请输入账号和密码以进入系统
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onSuccess={() => navigate(redirectTo, { replace: true })} />
          </CardContent>
          <CardFooter className='justify-center border-t py-4 text-xs text-muted-foreground'>
            <span>{brandText ? `${siteName} ${brandText}` : siteName}</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
