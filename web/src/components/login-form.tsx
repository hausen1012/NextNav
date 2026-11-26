import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogIn, Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { startPrivateSession } from '@/lib/pwa-cache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.login(username.trim(), password)
      await startPrivateSession(res.expiresAt)
      qc.setQueryData(['me'], {
        auth: 'admin',
        authMethod: 'cookie',
        username: res.user.username,
        expiresAt: res.expiresAt,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请检查账号与密码')
    } finally {
      setBusy(false)
    }
  }

  return (
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
        <label htmlFor='password' className='text-sm font-medium leading-none'>
          密码
        </label>
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
  )
}
