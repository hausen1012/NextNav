import { useEffect, useState } from 'react'
import { api, ApiError, type FetchSettingsDTO } from '@/lib/api'
import { useFetchSettings, useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import { Check } from 'lucide-react'

function bytesToMB(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return String(Number(mb.toFixed(2)))
}

function mbToBytes(val: string): number {
  const n = parseFloat(val)
  if (isNaN(n) || n <= 0) return 0
  return Math.round(n * 1024 * 1024)
}

export function AdminFetchSettingsPage() {
  const { data } = useFetchSettings()
  const invalidate = useInvalidateHome()

  const [settings, setSettings] = useState<FetchSettingsDTO | null>(null)
  const [htmlMaxMB, setHtmlMaxMB] = useState('')
  const [iconMaxMB, setIconMaxMB] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.fetch) {
      setSettings(data.fetch)
      setHtmlMaxMB(bytesToMB(data.fetch.htmlMaxBytes))
      setIconMaxMB(bytesToMB(data.fetch.iconMaxBytes))
    }
  }, [data])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await api.updateFetchSettings(settings)
      invalidate()
      setNotice('网络请求设置已成功保存')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-xl font-semibold tracking-tight'>网络请求</h1>
        <p className='text-sm text-muted-foreground'>
          按功能分块配置网页元信息抓取、站点图标回源与健康检测参数。
        </p>
      </div>

      <form onSubmit={save} className='space-y-6'>
        {notice && <Notice kind='success'>{notice}</Notice>}
        {error && <Notice kind='error'>{error}</Notice>}

        {/* 1. 网页元信息 */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle>网页元信息</CardTitle>
            <CardDescription>添加链接时自动获取网页标题与描述的请求参数。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Field label='网页请求 UA' htmlFor='fetch-html-ua'>
              <Input
                id='fetch-html-ua'
                value={settings?.htmlUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, htmlUserAgent: e.target.value })}
              />
            </Field>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <Field label='自动获取超时 (ms)' htmlFor='fetch-meta-timeout'>
                <Input
                  id='fetch-meta-timeout'
                  type='number'
                  min={100}
                  max={120000}
                  value={settings?.metaTimeoutMs ?? ''}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev && { ...prev, metaTimeoutMs: e.target.value === '' ? 0 : Number(e.target.value) },
                    )
                  }
                />
              </Field>

              <Field label='HTML 读取上限 (MB)' htmlFor='fetch-html-max-mb'>
                <Input
                  id='fetch-html-max-mb'
                  type='number'
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={htmlMaxMB}
                  onChange={(e) => {
                    const val = e.target.value
                    setHtmlMaxMB(val)
                    setSettings((prev) => prev && { ...prev, htmlMaxBytes: mbToBytes(val) })
                  }}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* 2. 站点图标 */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle>站点图标</CardTitle>
            <CardDescription>自动抓取并本地缓存站点 Favicon 图标的请求参数。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Field label='图标请求 UA' htmlFor='fetch-icon-ua'>
              <Input
                id='fetch-icon-ua'
                value={settings?.iconUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, iconUserAgent: e.target.value })}
              />
            </Field>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <Field label='图标回源超时 (ms)' htmlFor='fetch-favicon-timeout'>
                <Input
                  id='fetch-favicon-timeout'
                  type='number'
                  min={100}
                  max={120000}
                  value={settings?.faviconTimeoutMs ?? ''}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev && { ...prev, faviconTimeoutMs: e.target.value === '' ? 0 : Number(e.target.value) },
                    )
                  }
                />
              </Field>

              <Field label='图标读取上限 (MB)' htmlFor='fetch-icon-max-mb'>
                <Input
                  id='fetch-icon-max-mb'
                  type='number'
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={iconMaxMB}
                  onChange={(e) => {
                    const val = e.target.value
                    setIconMaxMB(val)
                    setSettings((prev) => prev && { ...prev, iconMaxBytes: mbToBytes(val) })
                  }}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* 3. 健康检测 */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle>健康检测</CardTitle>
            <CardDescription>链接连通性检测与全站后台批量巡检的请求参数。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Field label='健康检测 UA' htmlFor='fetch-health-ua'>
              <Input
                id='fetch-health-ua'
                value={settings?.healthUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, healthUserAgent: e.target.value })}
              />
            </Field>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <Field label='健康检查超时 (ms)' htmlFor='fetch-health-timeout'>
                <Input
                  id='fetch-health-timeout'
                  type='number'
                  min={100}
                  max={120000}
                  value={settings?.healthTimeoutMs ?? ''}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev && { ...prev, healthTimeoutMs: e.target.value === '' ? 0 : Number(e.target.value) },
                    )
                  }
                />
              </Field>

              <Field label='健康检查并发数' htmlFor='fetch-health-concurrency'>
                <Input
                  id='fetch-health-concurrency'
                  type='number'
                  min={1}
                  max={50}
                  value={settings?.healthConcurrency ?? ''}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev && { ...prev, healthConcurrency: e.target.value === '' ? 0 : Number(e.target.value) },
                    )
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className='flex items-center gap-3 pt-2'>
          <Button type='submit' disabled={saving || !settings} className='gap-2'>
            <Check className='size-4' />
            <span>{saving ? '保存中...' : '保存更改'}</span>
          </Button>
          <span className='text-xs text-muted-foreground'>
            留空或填 0 恢复代码默认值，保存后立即生效。
          </span>
        </div>
      </form>
    </div>
  )
}
