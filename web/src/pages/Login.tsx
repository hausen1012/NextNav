import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useSetupStatus } from '@/lib/query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'

export function LoginPage() {
  const navigate = useNavigate()
  const { data: setup } = useSetupStatus()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (setup && !setup.installed) {
    return <Navigate to='/setup' replace />
  }

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