import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogIn, Loader2, Sun, Moon, ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { api, ApiError } from '@/lib/api'
import { clearHomeCache, useHome } from '@/lib/query'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { data: homeData } = useHome()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getTheme())

  const siteName = homeData?.site.name || 'NextNav'
  const redirectTo = searchParams.get('redirect') || '/'

  const handleToggleTheme = () => {
    toggleTheme()
    setThemeState(getTheme())
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.login(username.trim(), password)
      await clearHomeCache()
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me'] }),
        qc.invalidateQueries({ queryKey: ['home'] }),
      ])
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请检查账号与密码')
    } finally {
      setBusy(false)
    }
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
            <form onSubmit={submit} className='grid gap-4'>
              <div className='grid gap-2'>
                <label htmlFor='username' className='text-sm font-medium leading-none'>
                  用户名
                </label>
                <Input
                  id='username'
                  placeholder='请输入用户名'
                  autoFocus
                  autoComplete='username'
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              <div className='grid gap-2'>
                <div className='flex items-center justify-between'>
                  <label htmlFor='password' className='text-sm font-medium leading-none'>
                    密码
                  </label>
                </div>
                <PasswordInput
                  id='password'
                  placeholder='请输入密码'
                  autoComplete='current-password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              {error && (
                <div className='rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
                  {error}
                </div>
              )}

              <Button type='submit' className='mt-2 w-full' disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    正在登录…
                  </>
                ) : (
                  <>
                    <LogIn className='mr-2 size-4' />
                    登录
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className='justify-center border-t py-4 text-xs text-muted-foreground'>
            <span>NextNav 极简个人导航系统</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
