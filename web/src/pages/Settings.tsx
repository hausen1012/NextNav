import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { useHome, useInvalidateHome, useMe } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'

export function SettingsPage() {
  const { data: me, isLoading: meLoading } = useMe()
  const { data: home } = useHome()
  const invalidate = useInvalidateHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (home) {
      setName(home.site.name)
      setDescription(home.site.description)
      setBackground(home.site.background)
    }
  }, [home])

  if (meLoading) {
    return <p className='py-16 text-center text-sm text-muted-foreground'>加载中…</p>
  }

  if (me?.auth !== 'admin') {
    return (
      <Card>
        <CardContent className='pt-6 text-center text-sm'>
          <p>需要管理员权限。</p>
          <Link to='/login' className='mt-3 inline-block text-primary hover:underline'>
            去登录
          </Link>
        </CardContent>
      </Card>
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setNotice(null)
    setError(null)
    try {
      await api.updateSettings({ name, description, background })
      invalidate()
      setNotice('已保存')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    }
  }

  async function clearSample() {
    if (!window.confirm('将删除所有仍标记为示例的分类与链接，确定吗？')) return
    setNotice(null)
    setError(null)
    try {
      const r = await api.clearSample()
      invalidate()
      setNotice(`已删除 ${r.deletedCategories} 个分类、${r.deletedLinks} 条链接`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  return (
    <div className='max-w-xl space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className='space-y-4'>
            <Field label='站点名' htmlFor='site-name'>
              <Input
                id='site-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                required
              />
            </Field>
            <Field label='副标题' htmlFor='site-desc'>
              <Input
                id='site-desc'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label='背景' htmlFor='site-bg' hint='CSS 颜色值，例如 #0f1115 或留空使用默认'>
              <Input
                id='site-bg'
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
            </Field>
            {notice ? <Notice kind='success'>{notice}</Notice> : null}
            {error ? <Notice kind='error'>{error}</Notice> : null}
            <Button type='submit'>保存</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>示例数据</CardTitle>
          <p className='text-sm text-muted-foreground'>
            安装时预置的大厂站点。删除只影响未被你编辑过的示例条目。
          </p>
        </CardHeader>
        <CardContent>
          <Button variant='destructive' onClick={clearSample}>
            清空示例数据
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}