import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/Field'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export function AdminSystemMaintenancePage() {
  const invalidate = useInvalidateHome()

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  async function clearSample() {
    if (!window.confirm('将删除所有标记为示例的分类与链接，确定吗？')) return
    setNotice(null)
    setError(null)
    setClearing(true)
    try {
      const r = await api.clearSample()
      invalidate()
      setNotice(`已清理 ${r.deletedCategories} 个示例分类、${r.deletedLinks} 条示例链接`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>运维维护</h1>
        <p className='text-sm text-muted-foreground'>
          缓存刷新与系统初始化演示数据维护。
        </p>
      </div>

      {notice && <Notice kind='success'>{notice}</Notice>}
      {error && <Notice kind='error'>{error}</Notice>}

      {/* Clear Sample Data */}
      <Card className='shadow-xs border-destructive/30'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-destructive'>
            <AlertTriangle className='size-5' />
            <span>示例数据清理</span>
          </CardTitle>
          <CardDescription>
            清理系统初始化时预置的演示数据。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            仅删除预置的示例分类与链接，自行添加的内容不受影响。
          </p>
          <Button variant='destructive' onClick={clearSample} disabled={clearing}>
            {clearing ? '正在清理...' : '清除示例数据'}
          </Button>
        </CardContent>
      </Card>

      {/* Cache & Maintenance */}
      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <RefreshCw className='size-5 text-primary' />
            <span>数据缓存管理</span>
          </CardTitle>
          <CardDescription>同步与刷新前后台导航数据缓存。</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            在多设备维护或数据未及时更新时，可主动重载最新数据状态。
          </p>
          <div>
            <Button
              variant='outline'
              size='sm'
              className='gap-2 text-xs'
              onClick={() => {
                invalidate()
                setNotice('已刷新最新数据缓存')
              }}
            >
              <RefreshCw className='size-3.5' />
              <span>刷新系统数据缓存</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
