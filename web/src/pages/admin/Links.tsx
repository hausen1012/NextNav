import { useState, useMemo } from 'react'
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit2,
  Copy,
  Check,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Shield,
  RotateCcw,
} from 'lucide-react'
import { useHome, useInvalidateHome } from '@/lib/query'
import { api, type LinkDTO } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/Field'
import { SiteIcon } from '@/components/SiteIcon'
import { TablePagination } from '@/components/admin/TablePagination'

export interface LinkWithMeta extends LinkDTO {
  categoryName: string
}

export function AdminLinksPage() {
  const { data: home, isLoading } = useHome()
  const invalidate = useInvalidateHome()

  // Filter & Search states
  const [keyword, setKeyword] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<number | 'all'>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  // Pagination states
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Sort states
  const [sortField, setSortField] = useState<'title' | 'category' | 'clicks' | 'status'>('title')
  const [sortAsc, setSortAsc] = useState(true)

  // Copy feedback
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [backupUrl, setBackupUrl] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<LinkWithMeta | null>(null)

  // Flatten links and category options
  const { flatCategories, flatLinks } = useMemo(() => {
    const categories: { id: number; name: string }[] = []
    const links: LinkWithMeta[] = []

    if (home?.groups) {
      for (const group of home.groups) {
        categories.push({ id: group.id, name: group.name })
        for (const link of group.links) {
          links.push({ ...link, categoryName: group.name })
        }
        for (const cat of group.categories || []) {
          categories.push({ id: cat.id, name: `${group.name} / ${cat.name}` })
          for (const link of cat.links) {
            links.push({ ...link, categoryName: cat.name })
          }
        }
      }
    }
    return { flatCategories: categories, flatLinks: links }
  }, [home])

  // Filter & Sort
  const filteredLinks = useMemo(() => {
    let list = flatLinks.filter((link) => {
      if (keyword.trim()) {
        const q = keyword.toLowerCase()
        const matchTitle = link.title.toLowerCase().includes(q)
        const matchUrl = link.url.toLowerCase().includes(q)
        const matchDesc = link.description?.toLowerCase().includes(q)
        if (!matchTitle && !matchUrl && !matchDesc) return false
      }
      if (selectedCatId !== 'all' && link.categoryId !== selectedCatId) {
        return false
      }
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'private' && !link.isPrivate) return false
        if (selectedStatus !== 'private' && link.status !== selectedStatus) return false
      }
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title') cmp = a.title.localeCompare(b.title, 'zh')
      else if (sortField === 'category') cmp = a.categoryName.localeCompare(b.categoryName, 'zh')
      else if (sortField === 'clicks') cmp = (a.clickCount || 0) - (b.clickCount || 0)
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status)
      return sortAsc ? cmp : -cmp
    })

    return list
  }, [flatLinks, keyword, selectedCatId, selectedStatus, sortField, sortAsc])

  // Paginated slice
  const paginatedLinks = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLinks.slice(start, start + pageSize)
  }, [filteredLinks, page, pageSize])

  const hasFilter = keyword.trim() !== '' || selectedCatId !== 'all' || selectedStatus !== 'all'

  function resetFilters() {
    setKeyword('')
    setSelectedCatId('all')
    setSelectedStatus('all')
    setPage(1)
  }

  function handleSort(field: 'title' | 'category' | 'clicks' | 'status') {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  function copyUrl(id: number, linkUrl: string) {
    navigator.clipboard.writeText(linkUrl)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function openCreate() {
    setEditingId(null)
    setTitle('')
    setUrl('')
    setCategoryId(flatCategories[0]?.id ?? 0)
    setDescription('')
    setBackupUrl('')
    setIsPrivate(false)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(link: LinkWithMeta) {
    setEditingId(link.id)
    setTitle(link.title)
    setUrl(link.url)
    setCategoryId(link.categoryId)
    setDescription(link.description || '')
    setBackupUrl(link.backupUrl || '')
    setIsPrivate(link.isPrivate)
    setError(null)
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const targetCatId = categoryId || flatCategories[0]?.id
    if (!targetCatId) {
      setError('请选择或先创建分类')
      setIsSubmitting(false)
      return
    }

    try {
      if (editingId) {
        await api.updateLink(editingId, {
          title,
          url,
          categoryId: targetCatId,
          description: description || null,
          backupUrl: backupUrl || null,
          isPrivate,
        })
      } else {
        await api.createLink({
          categoryId: targetCatId,
          title,
          url,
          description: description || null,
          backupUrl: backupUrl || null,
          isPrivate,
        })
      }
      invalidate()
      setModalOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!deleteItem) return
    setIsSubmitting(true)
    setError(null)
    try {
      await api.deleteLink(deleteItem.id)
      invalidate()
      setDeleteItem(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='space-y-4'>
      {/* Page Header */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl font-bold tracking-tight'>链接管理</h1>
            <Badge variant='secondary' className='rounded-full px-2 py-0.5 text-xs font-normal'>
              {flatLinks.length} 个链接
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground mt-0.5'>
            管理站点收录的全部网站链接、网址与健康状态
          </p>
        </div>
        <Button size='sm' className='gap-1.5' onClick={openCreate}>
          <Plus className='size-4' />
          <span>添加链接</span>
        </Button>
      </div>

      {/* Clean Toolbar tailored for Links */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-2.5 top-2.5 size-3.5 text-muted-foreground' />
            <Input
              placeholder='搜索链接名称或网址...'
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                setPage(1)
              }}
              className='h-8.5 pl-8 text-xs'
            />
          </div>

          <select
            value={selectedCatId}
            onChange={(e) => {
              setSelectedCatId(e.target.value === 'all' ? 'all' : Number(e.target.value))
              setPage(1)
            }}
            className='h-8.5 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部分类</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value)
              setPage(1)
            }}
            className='h-8.5 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部状态</option>
            <option value='ok'>🟢 正常响应</option>
            <option value='warn'>🟡 响应较慢</option>
            <option value='dead'>🔴 链接失效</option>
            <option value='private'>🔒 仅私有链接</option>
          </select>

          {hasFilter && (
            <Button
              variant='ghost'
              size='sm'
              onClick={resetFilters}
              className='h-8.5 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
            >
              <RotateCcw className='size-3' />
              <span>重置筛选</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead
                  className='cursor-pointer select-none'
                  onClick={() => handleSort('title')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    链接名称 {sortField === 'title' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead>网址 (URL)</TableHead>
                <TableHead
                  className='cursor-pointer select-none'
                  onClick={() => handleSort('category')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    归属分类 {sortField === 'category' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none'
                  onClick={() => handleSort('status')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    状态 {sortField === 'status' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none text-right'
                  onClick={() => handleSort('clicks')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground justify-end'>
                    点击量 {sortField === 'clicks' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead className='text-right w-24'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-28 text-center text-xs text-muted-foreground'>
                    正在加载链接...
                  </TableCell>
                </TableRow>
              ) : paginatedLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-28 text-center text-xs text-muted-foreground'>
                    {hasFilter ? '未找到符合条件的链接' : '暂无链接，点击右上角添加'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLinks.map((link) => (
                  <TableRow key={link.id} className='transition-colors'>
                    <TableCell>
                      <div className='flex items-center gap-2.5 min-w-[200px]'>
                        <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} />
                        <div className='min-w-0'>
                          <div className='flex items-center gap-1.5'>
                            <span className='font-medium text-sm truncate'>{link.title}</span>
                            {link.isPrivate && (
                              <Badge variant='secondary' className='text-[10px] px-1 py-0 gap-0.5 font-normal'>
                                <Shield className='size-2.5' />
                                私有
                              </Badge>
                            )}
                          </div>
                          {link.description && (
                            <p className='text-xs text-muted-foreground truncate max-w-[240px]'>
                              {link.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className='flex items-center gap-1.5 max-w-[260px]'>
                        <a
                          href={link.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-xs text-muted-foreground hover:text-foreground hover:underline truncate inline-flex items-center gap-1'
                        >
                          <span className='truncate'>{link.url}</span>
                          <ExternalLink className='size-3 shrink-0' />
                        </a>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-6 text-muted-foreground hover:text-foreground shrink-0'
                          onClick={() => copyUrl(link.id, link.url)}
                          title='复制链接'
                        >
                          {copiedId === link.id ? (
                            <Check className='size-3 text-emerald-600' />
                          ) : (
                            <Copy className='size-3' />
                          )}
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant='outline' className='text-xs font-normal'>
                        {link.categoryName}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {link.status === 'ok' && (
                        <span className='inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium'>
                          <CheckCircle2 className='size-3.5' />
                          正常
                        </span>
                      )}
                      {link.status === 'warn' && (
                        <span className='inline-flex items-center gap-1 text-xs text-amber-500 font-medium'>
                          <AlertCircle className='size-3.5' />
                          较慢
                        </span>
                      )}
                      {link.status === 'dead' && (
                        <span className='inline-flex items-center gap-1 text-xs text-destructive font-medium'>
                          <XCircle className='size-3.5' />
                          失效
                        </span>
                      )}
                      {link.status === 'unknown' && (
                        <span className='text-xs text-muted-foreground'>未检测</span>
                      )}
                    </TableCell>

                    <TableCell className='text-right text-xs text-muted-foreground'>
                      {link.clickCount ?? 0}
                    </TableCell>

                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7'
                          onClick={() => openEdit(link)}
                          title='编辑链接'
                        >
                          <Edit2 className='size-3.5' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7 text-destructive hover:text-destructive'
                          onClick={() => setDeleteItem(link)}
                          title='删除链接'
                        >
                          <Trash2 className='size-3.5' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Clean Shadcn Pagination */}
          {filteredLinks.length > 0 && (
            <div className='p-3'>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filteredLinks.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑链接' : '新建链接'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改链接详细配置与归属分类。' : '录入新链接信息并保存。'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <Field label='链接名称' htmlFor='modal-link-title'>
              <Input
                id='modal-link-title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='例如：Tailwind CSS'
                required
              />
            </Field>
            <Field label='网址 (URL)' htmlFor='modal-link-url'>
              <Input
                id='modal-link-url'
                type='url'
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder='https://tailwindcss.com'
                required
              />
            </Field>
            <Field label='归属分类' htmlFor='modal-link-cat'>
              <select
                id='modal-link-cat'
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              >
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label='描述介绍（可选）' htmlFor='modal-link-desc'>
              <Input
                id='modal-link-desc'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='快速实用的原子类 CSS 框架'
              />
            </Field>
            <Field label='备用网址（可选）' htmlFor='modal-link-backup'>
              <Input
                id='modal-link-backup'
                type='url'
                value={backupUrl}
                onChange={(e) => setBackupUrl(e.target.value)}
                placeholder='备用镜像或备选站点'
              />
            </Field>
            <div className='flex items-center gap-2 pt-1'>
              <input
                type='checkbox'
                id='modal-link-private'
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className='size-4 rounded border-input text-primary focus:ring-ring'
              />
              <label htmlFor='modal-link-private' className='text-sm text-foreground select-none cursor-pointer'>
                设为私有链接（仅管理员可见）
              </label>
            </div>
            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? '保存中...' : '确认保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='text-destructive'>删除链接</DialogTitle>
            <DialogDescription>
              确定要删除链接 <strong className='text-foreground'>{deleteItem?.title}</strong> 吗？
              此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDelete} className='pt-2'>
            {error && <p className='text-xs text-destructive mb-3'>{error}</p>}
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setDeleteItem(null)}>
                取消
              </Button>
              <Button type='submit' variant='destructive' disabled={isSubmitting}>
                {isSubmitting ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
