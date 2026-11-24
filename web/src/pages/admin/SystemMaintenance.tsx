import { useState, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { useInvalidateHome } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Notice } from '@/components/Field'
import { AlertTriangle, RefreshCw, Download, Upload, Database } from 'lucide-react'

export function AdminSystemMaintenancePage() {
  const invalidate = useInvalidateHome()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [importFile, setImportFile] = useState<File | null>(null)

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

  async function handleExport() {
    setExporting(true)
    setNotice(null)
    setError(null)
    try {
      const data = await api.exportBackup()
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `nextnav-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      setNotice('备份数据已成功导出')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '备份导出失败')
    } finally {
      setExporting(false)
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!importFile) {
      setError('请先选择要导入的 JSON 备份文件')
      return
    }
    if (importMode === 'overwrite') {
      if (!window.confirm('警告：覆盖导入将清空当前站点的全部现有分类与链接！此操作不可逆，确定继续吗？')) return
    }
    setImporting(true)
    setNotice(null)
    setError(null)
    try {
      const text = await importFile.text()
      const json = JSON.parse(text)
      const res = await api.importBackup(json, importMode)
      invalidate()
      setNotice(`导入完成：已导入 ${res.importedCategories} 个分类、${res.importedLinks} 条链接`)
      setImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '导入失败，请检查文件格式')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>运维维护</h1>
        <p className='text-sm text-muted-foreground'>
          数据备份与恢复、缓存刷新及演示数据清理。
        </p>
      </div>

      {notice && <Notice kind='success'>{notice}</Notice>}
      {error && <Notice kind='error'>{error}</Notice>}

      {/* Backup and Migration */}
      <Card className='shadow-xs'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Database className='size-5 text-primary' />
            <span>数据备份与迁移</span>
          </CardTitle>
          <CardDescription>
            全量 JSON 数据导出与导入，支持跨实例合并或覆盖迁移。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Export */}
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b'>
            <div>
              <p className='text-sm font-medium'>数据导出</p>
              <p className='text-xs text-muted-foreground'>
                导出包含站点设置、分类与链接的完整 JSON 备份文件（严格剔除密码与密钥）。
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={handleExport}
              disabled={exporting}
              className='gap-1.5 shrink-0'
            >
              <Download className='size-3.5' />
              <span>{exporting ? '导出中...' : '导出 JSON 备份'}</span>
            </Button>
          </div>

          {/* Import */}
          <form onSubmit={handleImport} className='space-y-3'>
            <div>
              <p className='text-sm font-medium'>数据导入</p>
              <p className='text-xs text-muted-foreground'>
                上传以前导出的 JSON 备份文件还原全站或同步链接。
              </p>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <div>
                <label className='block text-xs font-medium text-muted-foreground mb-1'>选择备份文件</label>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.json,application/json'
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className='block w-full text-xs text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer'
                />
              </div>
              <div>
                <label className='block text-xs font-medium text-muted-foreground mb-1'>导入模式</label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'merge' | 'overwrite')}
                  className='w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                >
                  <option value='merge'>合并模式（保留现有，跳过重复链接）</option>
                  <option value='overwrite'>覆盖模式（清空全部现有数据，全新导入）</option>
                </select>
              </div>
            </div>
            <Button
              type='submit'
              size='sm'
              disabled={importing || !importFile}
              className='gap-1.5'
            >
              <Upload className='size-3.5' />
              <span>{importing ? '正在导入...' : '开始导入'}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

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
