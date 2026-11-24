import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSetupStatus } from '@/lib/query'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'

export function SetupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: setup, isLoading: checkingSetup } = useSetupStatus()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [seedSample, setSeedSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!checkingSetup && setup?.installed) {
    return <Navigate to='/' replace />
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
      await api.setup(username.trim(), password, seedSample)
      await qc.invalidateQueries({ queryKey: ['home'] })
      await qc.invalidateQueries({ queryKey: ['me'] })
      await qc.refetchQueries({ queryKey: ['home'] })
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
          <div className='flex items-center gap-2 pt-1'>
            <input
              id='seed-sample'
              type='checkbox'
              checked={seedSample}
              onChange={(e) => setSeedSample(e.target.checked)}
              className='size-4 rounded border-border text-primary focus:ring-primary'
            />
            <label htmlFor='seed-sample' className='text-sm text-foreground cursor-pointer select-none'>
              导入演示示例数据（常用工具、设计与技术资源）
            </label>
          </div>
          {error ? <Notice kind='error'>{error}</Notice> : null}
          <Button type='submit' disabled={busy} className='w-full'>
            {busy ? (seedSample ? '正在初始化并导入示例数据…' : '正在创建账号…') : '完成安装并进入'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}