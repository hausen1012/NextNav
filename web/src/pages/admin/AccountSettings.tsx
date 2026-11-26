import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type TokenInfo } from '@/lib/api'
import { useMe } from '@/lib/query'
import { startPrivateSession } from '@/lib/pwa-cache'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ShieldCheck, Key, Copy, Check, Trash2, Plus } from 'lucide-react'

export function AdminAccountSettingsPage() {
  const qc = useQueryClient()
  const { data: me } = useMe()

  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // API Token State
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenOperating, setTokenOperating] = useState(false)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  useEffect(() => {
    let active = true
    setTokenLoading(true)
    api
      .getToken()
      .then((res) => {
        if (active) setTokenInfo(res.token)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setTokenLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
      const res = await api.updateAccount({
        currentPassword,
        username: username.trim() || undefined,
        newPassword: newPassword || undefined,
      })
      if (res.expiresAt) await startPrivateSession(res.expiresAt)
      qc.setQueryData(['me'], (current: typeof me) => current
        ? { ...current, username: res.username, expiresAt: res.expiresAt ?? current.expiresAt }
        : current)
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

  async function handleCreateToken() {
    if (tokenInfo && !window.confirm('重新生成令牌将使现有令牌立即失效，确定要继续吗？')) return
    setTokenOperating(true)
    setError(null)
    try {
      const res = await api.createToken()
      setNewlyCreatedToken(res.token)
      setTokenInfo(res.info)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成令牌失败')
    } finally {
      setTokenOperating(false)
    }
  }

  async function handleDeleteToken() {
    if (!window.confirm('确定要撤回当前 API 访问令牌吗？撤回后外部调用将立即失效。')) return
    setTokenOperating(true)
    setError(null)
    try {
      await api.deleteToken()
      setTokenInfo(null)
      setNewlyCreatedToken(null)
      setNotice('API 访问令牌已撤回')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '撤回令牌失败')
    } finally {
      setTokenOperating(false)
    }
  }

  const copyToken = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>账户安全</h1>
        <p className='text-sm text-muted-foreground'>
          修改管理员账户凭据与外部 API 访问令牌。
        </p>
      </div>

      {notice && <Notice kind='success'>{notice}</Notice>}
      {error && <Notice kind='error'>{error}</Notice>}

      {/* Admin Credentials */}
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
            <Field label='新用户名' htmlFor='acc-username' hint='留空保持当前用户名不变'>
              <Input
                id='acc-username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={me?.username || 'admin'}
              />
            </Field>

            <Field label='当前密码' htmlFor='acc-curr-pwd'>
              <Input
                id='acc-curr-pwd'
                type='password'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>

            <Field label='新密码' htmlFor='acc-new-pwd' hint='至少 8 位字符，不修改请留空'>
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

            <div className='pt-2'>
              <Button type='submit' disabled={saving}>
                {saving ? '保存中...' : '更新安全凭据'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* API Token Management */}
      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Key className='size-5 text-primary' />
            <span>API 访问令牌</span>
          </CardTitle>
          <CardDescription>
            用于浏览器插件、自动化脚本或外部系统调用 REST API（通过 Authorization: Bearer &lt;token&gt; 鉴权）。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {tokenLoading ? (
            <p className='text-xs text-muted-foreground'>正在读取令牌配置...</p>
          ) : tokenInfo ? (
            <div className='rounded-lg border bg-muted/20 p-3.5 space-y-3 text-xs'>
              <div className='flex items-center justify-between'>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium text-foreground'>当前令牌：</span>
                    <code className='rounded bg-muted px-1.5 py-0.5 font-mono text-primary font-semibold'>
                      {tokenInfo.prefix}••••••••••••••••••••••••••••
                    </code>
                  </div>
                  <div className='text-muted-foreground'>
                    创建于 {new Date(tokenInfo.createdAt).toLocaleString()} ·
                    最近使用：{tokenInfo.lastUsedAt ? new Date(tokenInfo.lastUsedAt).toLocaleString() : '从未使用'}
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleCreateToken}
                    disabled={tokenOperating}
                    className='h-7 text-xs'
                  >
                    重新生成
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={handleDeleteToken}
                    disabled={tokenOperating}
                    className='h-7 text-xs gap-1'
                  >
                    <Trash2 className='size-3' />
                    <span>撤回</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className='flex items-center justify-between rounded-lg border border-dashed p-4 text-xs'>
              <p className='text-muted-foreground'>当前未配置 API 访问令牌。</p>
              <Button
                size='sm'
                onClick={handleCreateToken}
                disabled={tokenOperating}
                className='h-7 gap-1 text-xs'
              >
                <Plus className='size-3.5' />
                <span>生成访问令牌</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Newly Created Token Dialog */}
      <Dialog open={Boolean(newlyCreatedToken)} onOpenChange={(open) => !open && setNewlyCreatedToken(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Key className='size-5 text-primary' />
              <span>新 API 令牌已生成</span>
            </DialogTitle>
            <DialogDescription>
              请立即复制并保存此令牌。出于安全原因，<strong>它将不会再次完整显示</strong>。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 pt-2'>
            <div className='flex items-center gap-2 rounded-md border bg-muted/50 p-2.5 font-mono text-xs break-all'>
              <span className='flex-1 select-all font-semibold'>{newlyCreatedToken}</span>
              <Button
                variant='ghost'
                size='icon'
                className='size-7 shrink-0'
                onClick={() => newlyCreatedToken && copyToken(newlyCreatedToken)}
                title='复制令牌'
              >
                {tokenCopied ? <Check className='size-3.5 text-emerald-600' /> : <Copy className='size-3.5' />}
              </Button>
            </div>
            <p className='text-[11px] text-muted-foreground'>
              在 HTTP 请求头中添加：<code>Authorization: Bearer {newlyCreatedToken}</code>
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewlyCreatedToken(null)}>
              我已安全保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
