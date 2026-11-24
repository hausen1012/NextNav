import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/Field'
import { AlertTriangle, RefreshCw, Database } from 'lucide-react'

export function AdminSystemMaintenancePage() {
  const invalidate = useInvalidateHome()

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  async function clearSample() {
    if (!window.confirm('将删除所有初始化时标记为示例的分类与链接，确定吗？')) return
    setNotice(null)
    setError(null)
    setClearing(true)
    try {
      const r = await api.clearSample()
      invalidate()
      setNotice(`已成功删除 ${r.deletedCategories} 个示例分类、${r.deletedLinks} 条示例链接`)
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
          数据清理、示例初始化数据重置与系统运行状态监控。
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
            安装后系统预置了一批示例分类与书签，当你录入完个人数据后可一键清理它们。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            注意：仅删除带有 sample 标记的预置书签与分类，您自行手动添加或修改过的项不会受到影响。
          </p>
          <Button variant='destructive' onClick={clearSample} disabled={clearing}>
            {clearing ? '正在清理...' : '一键清除所有示例数据'}
          </Button>
        </CardContent>
      </Card>

      {/* System info */}
      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Database className='size-5 text-primary' />
            <span>存储与环境信息</span>
          </CardTitle>
          <CardDescription>NextNav 运行时底层架构参数。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 gap-4 text-sm'>
            <div className='rounded-lg border p-3'>
              <span className='text-xs text-muted-foreground block'>后端架构</span>
              <span className='font-medium mt-1 block'>Go 1.23+ / go:embed 单二进制</span>
            </div>
            <div className='rounded-lg border p-3'>
              <span className='text-xs text-muted-foreground block'>数据库</span>
              <span className='font-medium mt-1 block'>SQLite 3 (WAL 模式)</span>
            </div>
            <div className='rounded-lg border p-3'>
              <span className='text-xs text-muted-foreground block'>前端体系</span>
              <span className='font-medium mt-1 block'>Vite + React 18 + shadcn-admin</span>
            </div>
            <div className='rounded-lg border p-3'>
              <span className='text-xs text-muted-foreground block'>内存占用控制</span>
              <span className='font-medium mt-1 block'>&lt; 30MB 极低资源开销</span>
            </div>
          </div>
          <div className='pt-4'>
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
              <span>刷新系统状态缓存</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
