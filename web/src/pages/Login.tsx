import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'

export function LoginPage() {
  const navigate = useNavigate()
  const [needsSetup, setNeedsSetup] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .setupStatus()
      .then((r) => {
        if (!r.installed) setNeedsSetup(true)
      })
      .catch(() => undefined)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  if (needsSetup) {
    return (
      <Card>
        <CardContent className='pt-6 text-center text-sm'>
          <p>站点还没有管理员账号。</p>
          <Link to='/setup' className='mt-3 inline-block text-primary hover:underline'>
            前往安装
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className='space-y-4'>
          <Field label='用户名' htmlFor='username'>
            <Input
              id='username'
              autoFocus
              autoComplete='username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label='密码' htmlFor='password'>
            <Input
              id='password'
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error ? <Notice kind='error'>{error}</Notice> : null}
          <Button type='submit' disabled={busy} className='w-full'>
            {busy ? '登录中…' : '登录'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}