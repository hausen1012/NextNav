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
import { SiteIcon } from '@/components/SiteIcon'
import { TablePagination } from '@/components/admin/TablePagination'
import { LinkDialog } from '@/components/admin/LinkDialog'

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
  const [sortField, setSortField] = useState<'title' | 'category' | 'sort' | 'status'>('title')
  const [sortAsc, setSortAsc] = useState(true)

  // Copy feedback
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<LinkWithMeta | null>(null)

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<LinkWithMeta | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
      else if (sortField === 'sort') {
        cmp = (a.sort ?? 0) - (b.sort ?? 0)
        if (cmp === 0) {
          cmp = a.id - b.id
        }
      }
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

  function handleSort(field: 'title' | 'category' | 'sort' | 'status') {
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
    setEditingLink(null)
    setModalOpen(true)
  }

  function openEdit(link: LinkWithMeta) {
    setEditingLink(link)
    setModalOpen(true)
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!deleteItem) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteLink(deleteItem.id)
      invalidate()
      setDeleteItem(null)
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-4'>
      {/* Page Header */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-xl font-bold tracking-tight'>链接管理</h1>
          <p className='text-xs text-muted-foreground mt-0.5'>
            管理站点收录的网站链接与健康状态
          </p>
        </div>
        <Button size='sm' className='gap-1.5' onClick={openCreate}>
          <Plus className='size-4' />
          <span>添加链接</span>
        </Button>
      </div>

      {/* Toolbar */}
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
              className='h-8 pl-8 text-xs'
            />
          </div>

          <select
            value={selectedCatId}
            onChange={(e) => {
              setSelectedCatId(e.target.value === 'all' ? 'all' : Number(e.target.value))
              setPage(1)
            }}
            className='h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
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
            className='h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部状态</option>
            <option value='ok'>正常响应</option>
            <option value='warn'>响应较慢</option>
            <option value='dead'>链接失效</option>
            <option value='private'>仅私有链接</option>
          </select>

          {hasFilter && (
            <Button
              variant='ghost'
              size='sm'
              onClick={resetFilters}
              className='h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
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
                  className='cursor-pointer select-none w-20 text-center'
                  onClick={() => handleSort('sort')}
                >
                  <span className='inline-flex w-full items-center justify-center gap-1 font-semibold text-xs text-foreground'>
                    排序 {sortField === 'sort' && (sortAsc ? '↑' : '↓')}
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
                      <span className='text-xs text-muted-foreground'>
                        {link.categoryName}
                      </span>
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

                    <TableCell className='text-center text-xs text-muted-foreground font-mono'>
                      {link.sort}
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
      <LinkDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        link={editingLink}
        categories={flatCategories}
        onSuccess={invalidate}
      />

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
            {deleteError && <p className='text-xs text-destructive mb-3'>{deleteError}</p>}
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setDeleteItem(null)}>
                取消
              </Button>
              <Button type='submit' variant='destructive' disabled={isDeleting}>
                {isDeleting ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
