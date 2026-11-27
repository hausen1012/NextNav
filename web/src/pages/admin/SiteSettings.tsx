import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useInvalidateHome, useSettings } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import { Check, Trash2, Upload } from 'lucide-react'
import { Logo } from '@/components/Logo'

export function AdminSiteSettingsPage() {
  const { data: settings } = useSettings()
  const invalidate = useInvalidateHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState('')
  const [faviconServiceUrl, setFaviconServiceUrl] = useState('')
  const [openInNewTab, setOpenInNewTab] = useState(true)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings) {
      setName(settings.site.name)
      setDescription(settings.site.description)
      setBackground(settings.site.background)
      setFaviconServiceUrl(settings.site.faviconServiceUrl || '')
      setOpenInNewTab(settings.site.openInNewTab ?? true)
    }
  }, [settings])

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      setError('文件大小不能超过 1MB')
      return
    }
    setUploadingLogo(true)
    setError(null)
    setNotice(null)
    try {
      await api.uploadLogo(file)
      invalidate()
      setNotice('Logo 已成功更新')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Logo 上传失败')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleLogoRemove() {
    if (!confirm('确定恢复为默认罗盘 Logo 吗？')) return
    setUploadingLogo(true)
    setError(null)
    setNotice(null)
    try {
      await api.removeLogo()
      invalidate()
      setNotice('已恢复为默认 Logo')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '清除 Logo 失败')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await api.updateSettings({ name, description, background, faviconServiceUrl, openInNewTab })
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
        <h1 className='text-xl font-semibold tracking-tight'>站点展示</h1>
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

            <Field label='站点图标 / Logo' htmlFor='site-logo'>
              <div className='flex items-center gap-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4'>
                <div className='flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted/30 shadow-2xs overflow-hidden'>
                  <Logo src={settings?.site.logoUrl} className='size-10' />
                </div>
                <div className='space-y-1.5 flex-1'>
                  <div className='flex items-center gap-2'>
                    <input
                      type='file'
                      ref={fileInputRef}
                      onChange={handleLogoFileChange}
                      accept='image/png,image/jpeg,image/webp'
                      className='hidden'
                      id='logo-file-input'
                    />
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={uploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className='gap-1.5 text-xs'
                    >
                      <Upload className='size-3.5' />
                      <span>{uploadingLogo ? '上传中...' : '上传新 Logo'}</span>
                    </Button>
                    {settings?.site.logoUrl && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        disabled={uploadingLogo}
                        onClick={handleLogoRemove}
                        className='gap-1.5 text-xs text-destructive hover:text-destructive'
                      >
                        <Trash2 className='size-3.5' />
                        <span>恢复默认</span>
                      </Button>
                    )}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    支持 PNG、JPEG、WebP 格式，文件大小不超过 1MB。
                  </p>
                </div>
              </div>
            </Field>

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

            <Field
              label='全局图标服务 (Favicon)'
              htmlFor='site-favicon-service'
              hint='未单独设置图标的链接将由此自动拼接获取。支持 {domain} 占位符或直接以前缀/结尾（留空则不启用）。'
            >
              <div className='space-y-2'>
                <Input
                  id='site-favicon-service'
                  value={faviconServiceUrl}
                  onChange={(e) => setFaviconServiceUrl(e.target.value)}
                  placeholder='例如：https://a.favicon.im/ 或 /api/favicon/{domain}.png'
                />
                <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                  <span>常用预设：</span>
                  <button
                    type='button'
                    onClick={() => setFaviconServiceUrl('/api/favicon/{domain}.png')}
                    className='rounded border border-border px-1.5 py-0.5 hover:bg-muted transition text-foreground'
                  >
                    内置服务 (/api/favicon/{'{domain}'}.png)
                  </button>
                  <button
                    type='button'
                    onClick={() => setFaviconServiceUrl('https://a.favicon.im/')}
                    className='rounded border border-border px-1.5 py-0.5 hover:bg-muted transition text-foreground'
                  >
                    Favicon.im (https://a.favicon.im/)
                  </button>
                  {faviconServiceUrl && (
                    <button
                      type='button'
                      onClick={() => setFaviconServiceUrl('')}
                      className='rounded border border-border px-1.5 py-0.5 hover:bg-muted transition text-muted-foreground'
                    >
                      清空
                    </button>
                  )}
                </div>
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
