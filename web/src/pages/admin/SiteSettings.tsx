import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useHome, useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import { Check } from 'lucide-react'

export function AdminSiteSettingsPage() {
  const { data: home } = useHome()
  const invalidate = useInvalidateHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState('')
  const [openInNewTab, setOpenInNewTab] = useState(true)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (home) {
      setName(home.site.name)
      setDescription(home.site.description)
      setBackground(home.site.background)
      setOpenInNewTab(home.site.openInNewTab ?? true)
    }
  }, [home])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await api.updateSettings({ name, description, background, openInNewTab })
      invalidate()
      setNotice('站点设置已成功保存')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>站点设置</h1>
        <p className='text-sm text-muted-foreground'>
          自定义站点名称、描述与全局偏好配置。
        </p>
      </div>

      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle>基础展示配置</CardTitle>
          <CardDescription>对外公开展示的基本信息与访问偏好。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className='space-y-4'>
            {notice && <Notice kind='success'>{notice}</Notice>}
            {error && <Notice kind='error'>{error}</Notice>}

            <Field label='站点标题' htmlFor='site-name'>
              <Input
                id='site-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                required
              />
            </Field>

            <Field label='站点副标题 / 描述' htmlFor='site-desc'>
              <Input
                id='site-desc'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='例如：我的个人常用导航站'
              />
            </Field>

            <Field
              label='全局背景色'
              htmlFor='site-bg'
              hint='支持 HEX 或 CSS 颜色值，留空使用默认背景'
            >
              <div className='flex items-center gap-3'>
                <Input
                  id='site-bg'
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder='#ffffff 或 #0f1115'
                />
                {background && (
                  <div
                    className='size-9 shrink-0 rounded-md border shadow-2xs'
                    style={{ backgroundColor: background }}
                    title='颜色预览'
                  />
                )}
              </div>
            </Field>

            <div className='flex items-center gap-2 pt-2'>
              <input
                type='checkbox'
                id='site-open-tab'
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className='size-4 rounded border-input text-primary focus:ring-ring'
              />
              <label htmlFor='site-open-tab' className='text-sm text-foreground select-none cursor-pointer'>
                点击链接默认在新标签页打开
              </label>
            </div>

            <div className='pt-4'>
              <Button type='submit' disabled={saving} className='gap-2'>
                <Check className='size-4' />
                <span>{saving ? '保存中...' : '保存更改'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
