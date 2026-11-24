import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useMe } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import { ShieldCheck } from 'lucide-react'

export function AdminAccountSettingsPage() {
  const { data: me } = useMe()

  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setNotice(null)
    setError(null)

    if (newPassword && newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setSaving(true)
    try {
      await api.updateAccount({
        currentPassword,
        username: username.trim() || undefined,
        newPassword: newPassword || undefined,
      })
      setNotice('账户与密码已成功更新')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更新账户失败，请检查当前密码是否正确')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>账户安全</h1>
        <p className='text-sm text-muted-foreground'>
          修改 NextNav 管理员用户名与登录密码。
        </p>
      </div>

      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <ShieldCheck className='size-5 text-primary' />
            <span>管理员凭据</span>
          </CardTitle>
          <CardDescription>
            当前管理员账号: <strong className='text-foreground'>{me?.username || 'admin'}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className='space-y-4'>
            {notice && <Notice kind='success'>{notice}</Notice>}
            {error && <Notice kind='error'>{error}</Notice>}

            <Field label='新用户名（可选）' htmlFor='acc-username' hint='留空则保持当前用户名'>
              <Input
                id='acc-username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={me?.username || 'admin'}
              />
            </Field>

            <Field label='当前密码（必填）' htmlFor='acc-curr-pwd' hint='用于确认本人操作'>
              <Input
                id='acc-curr-pwd'
                type='password'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>

            <Field label='新密码（可选）' htmlFor='acc-new-pwd' hint='至少 8 个字符，不修改请留空'>
              <Input
                id='acc-new-pwd'
                type='password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
              />
            </Field>

            {newPassword && (
              <Field label='确认新密码' htmlFor='acc-confirm-pwd'>
                <Input
                  id='acc-confirm-pwd'
                  type='password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </Field>
            )}

            <div className='pt-4'>
              <Button type='submit' disabled={saving}>
                {saving ? '保存中...' : '更新安全凭据'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
