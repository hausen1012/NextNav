import { useEffect, useState } from 'react'
import { api, ApiError, type FetchSettingsDTO } from '@/lib/api'
import { useFetchSettings, useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/Field'
import { Check } from 'lucide-react'

type FetchNumberKey =
  | 'clientTimeoutMs'
  | 'metaTimeoutMs'
  | 'faviconTimeoutMs'
  | 'healthTimeoutMs'
  | 'htmlMaxBytes'
  | 'iconMaxBytes'
  | 'healthConcurrency'

const fetchNumberFields: { key: FetchNumberKey; label: string; min: number; max: number }[] = [
  { key: 'clientTimeoutMs', label: '单次请求超时 (ms)', min: 100, max: 120000 },
  { key: 'metaTimeoutMs', label: '自动获取超时 (ms)', min: 100, max: 120000 },
  { key: 'faviconTimeoutMs', label: '图标回源超时 (ms)', min: 100, max: 120000 },
  { key: 'healthTimeoutMs', label: '健康检查超时 (ms)', min: 100, max: 120000 },
  { key: 'htmlMaxBytes', label: 'HTML 读取上限 (B)', min: 1024, max: 10485760 },
  { key: 'iconMaxBytes', label: '图标读取上限 (B)', min: 1024, max: 10485760 },
  { key: 'healthConcurrency', label: '健康检查并发数', min: 1, max: 50 },
]

export function AdminFetchSettingsPage() {
  const { data } = useFetchSettings()
  const invalidate = useInvalidateHome()

  const [settings, setSettings] = useState<FetchSettingsDTO | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.fetch) setSettings(data.fetch)
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
      setNotice('抓取设置已成功保存')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-xl font-semibold tracking-tight'>抓取参数</h1>
        <p className='text-sm text-muted-foreground'>
          配置自动获取、图标回源与健康检查的请求参数。
        </p>
      </div>

      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle>请求参数</CardTitle>
          <CardDescription>留空或填 0 恢复代码默认值，保存后立即生效。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className='space-y-4'>
            {notice && <Notice kind='success'>{notice}</Notice>}
            {error && <Notice kind='error'>{error}</Notice>}

            <Field label='网页请求 UA' htmlFor='fetch-html-ua'>
              <Input
                id='fetch-html-ua'
                value={settings?.htmlUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, htmlUserAgent: e.target.value })}
              />
            </Field>

            <Field label='图标请求 UA' htmlFor='fetch-icon-ua'>
              <Input
                id='fetch-icon-ua'
                value={settings?.iconUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, iconUserAgent: e.target.value })}
              />
            </Field>

            <Field label='健康检查 UA' htmlFor='fetch-health-ua'>
              <Input
                id='fetch-health-ua'
                value={settings?.healthUserAgent ?? ''}
                onChange={(e) => setSettings((prev) => prev && { ...prev, healthUserAgent: e.target.value })}
              />
            </Field>

            {fetchNumberFields.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`fetch-${field.key}`}>
                <Input
                  id={`fetch-${field.key}`}
                  type='number'
                  min={field.min}
                  max={field.max}
                  value={settings?.[field.key] ?? ''}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev && { ...prev, [field.key]: e.target.value === '' ? 0 : Number(e.target.value) },
                    )
                  }
                />
              </Field>
            ))}

            <div className='pt-4'>
              <Button type='submit' disabled={saving || !settings} className='gap-2'>
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
