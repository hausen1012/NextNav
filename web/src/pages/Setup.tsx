import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'

export function SetupPage() {
  const navigate = useNavigate()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .setupStatus()
      .then((r) => setInstalled(r.installed))
      .catch(() => setInstalled(null))
  }, [])

  if (installed === true) {
    return (
      <Card>
        <CardContent className='pt-6 text-center text-sm'>
          <p>站点已完成安装。</p>
          <Link to='/login' className='mt-3 inline-block text-primary hover:underline'>
            去登录
          </Link>
        </CardContent>
      </Card>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('密码至少 8 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      await api.setup(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '安装失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>首次安装</CardTitle>
        <p className='text-sm text-muted-foreground'>创建管理员账号后即可开始使用。</p>
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
              maxLength={32}
            />
          </Field>
          <Field label='密码' htmlFor='password' hint='至少 8 位'>
            <Input
              id='password'
              type='password'
              autoComplete='new-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label='确认密码' htmlFor='confirm'>
            <Input
              id='confirm'
              type='password'
              autoComplete='new-password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
          {error ? <Notice kind='error'>{error}</Notice> : null}
          <Button type='submit' disabled={busy} className='w-full'>
            {busy ? '创建中…' : '创建账号'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}