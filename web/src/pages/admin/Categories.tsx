import { useState, useMemo } from 'react'
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Shield,
  Folder,
  Search,
  RotateCcw,
} from 'lucide-react'
import { useHome, useInvalidateHome } from '@/lib/query'
import { api, type GroupDTO, type CategoryDTO } from '@/lib/api'
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
import { TablePagination } from '@/components/admin/TablePagination'

export interface FlatCategory {
  id: number
  name: string
  parentId?: number
  parentName?: string
  isPrivate: boolean
  linkCount: number
  isRoot: boolean
}

export function AdminCategoriesPage() {
  const { data: home, isLoading } = useHome()
  const invalidate = useInvalidateHome()

  // Filter & Search
  const [keyword, setKeyword] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'root' | 'sub'>('all')
  const [selectedPrivacy, setSelectedPrivacy] = useState<'all' | 'public' | 'private'>('all')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Sort
  const [sortField, setSortField] = useState<'name' | 'parent' | 'links'>('name')
  const [sortAsc, setSortAsc] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | undefined>(undefined)
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [editItem, setEditItem] = useState<FlatCategory | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrivate, setEditPrivate] = useState(false)

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<FlatCategory | null>(null)
  const [deleteMode, setDeleteMode] = useState<'delete' | 'move'>('delete')
  const [targetCatId, setTargetCatId] = useState<number | undefined>(undefined)

  const groups: GroupDTO[] = home?.groups || []

  // Flatten categories
  const { flatCategories, rootGroups } = useMemo(() => {
    const list: FlatCategory[] = []
    const roots: { id: number; name: string }[] = []

    for (const g of groups) {
      roots.push({ id: g.id, name: g.name })
      list.push({
        id: g.id,
        name: g.name,
        isPrivate: false,
        linkCount: g.links?.length ?? 0,
        isRoot: true,
      })
      for (const c of (g.categories || []) as CategoryDTO[]) {
        list.push({
          id: c.id,
          name: c.name,
          parentId: g.id,
          parentName: g.name,
          isPrivate: c.isPrivate,
          linkCount: c.links?.length ?? 0,
          isRoot: false,
        })
      }
    }
    return { flatCategories: list, rootGroups: roots }
  }, [groups])

  // Filter & Sort
  const filteredCategories = useMemo(() => {
    let list = flatCategories.filter((cat) => {
      if (keyword.trim()) {
        const q = keyword.toLowerCase()
        const matchName = cat.name.toLowerCase().includes(q)
        const matchParent = cat.parentName?.toLowerCase().includes(q)
        if (!matchName && !matchParent) return false
      }
      if (selectedType === 'root' && !cat.isRoot) return false
      if (selectedType === 'sub' && cat.isRoot) return false
      if (selectedPrivacy === 'public' && cat.isPrivate) return false
      if (selectedPrivacy === 'private' && !cat.isPrivate) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name, 'zh')
      else if (sortField === 'parent') cmp = (a.parentName || '').localeCompare(b.parentName || '', 'zh')
      else if (sortField === 'links') cmp = a.linkCount - b.linkCount
      return sortAsc ? cmp : -cmp
    })

    return list
  }, [flatCategories, keyword, selectedType, selectedPrivacy, sortField, sortAsc])

  // Paginated slice
  const paginatedCategories = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredCategories.slice(start, start + pageSize)
  }, [filteredCategories, page, pageSize])

  const hasFilter = keyword.trim() !== '' || selectedType !== 'all' || selectedPrivacy !== 'all'

  function resetFilters() {
    setKeyword('')
    setSelectedType('all')
    setSelectedPrivacy('all')
    setPage(1)
  }

  function handleSort(field: 'name' | 'parent' | 'links') {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  function openCreate(defaultParentId?: number) {
    setName('')
    setParentId(defaultParentId)
    setIsPrivate(false)
    setError(null)
    setCreateOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await api.createCategory({
        name,
        parentId: parentId || null,
        isPrivate,
      })
      invalidate()
      setCreateOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建分类失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    setIsSubmitting(true)
    setError(null)
    try {
      await api.updateCategory(editItem.id, {
        name: editName,
        isPrivate: editPrivate,
      })
      invalidate()
      setEditItem(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新分类失败')
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
      await api.deleteCategory(deleteItem.id, deleteMode, targetCatId)
      invalidate()
      setDeleteItem(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除分类失败')
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
            <h1 className='text-xl font-bold tracking-tight'>分类管理</h1>
            <Badge variant='secondary' className='rounded-full px-2 py-0.5 text-xs font-normal'>
              {flatCategories.length} 个分类
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground mt-0.5'>
            管理书签导航的分组层级、从属关系与公开权限
          </p>
        </div>
        <Button size='sm' className='gap-1.5' onClick={() => openCreate()}>
          <Plus className='size-4' />
          <span>新建分类</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-2.5 top-2.5 size-3.5 text-muted-foreground' />
            <Input
              placeholder='搜索分类或所属分组...'
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                setPage(1)
              }}
              className='h-8.5 pl-8 text-xs'
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as 'all' | 'root' | 'sub')
              setPage(1)
            }}
            className='h-8.5 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部层级</option>
            <option value='root'>仅顶级主分组</option>
            <option value='sub'>仅二级子分类</option>
          </select>

          <select
            value={selectedPrivacy}
            onChange={(e) => {
              setSelectedPrivacy(e.target.value as 'all' | 'public' | 'private')
              setPage(1)
            }}
            className='h-8.5 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部权限</option>
            <option value='public'>公开可见</option>
            <option value='private'>仅私有分类</option>
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

      {/* Categories Table Card */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead
                  className='cursor-pointer select-none w-[280px]'
                  onClick={() => handleSort('name')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    分类名称 {sortField === 'name' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none'
                  onClick={() => handleSort('parent')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    层级归属 {sortField === 'parent' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none'
                  onClick={() => handleSort('links')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    包含书签 {sortField === 'links' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead>可见权限</TableHead>
                <TableHead className='text-right w-36'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='h-28 text-center text-xs text-muted-foreground'>
                    正在加载分类...
                  </TableCell>
                </TableRow>
              ) : paginatedCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='h-28 text-center text-xs text-muted-foreground'>
                    {hasFilter ? '未找到符合条件的分类' : '暂无分类，请点击右上角新建'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCategories.map((cat) => (
                  <TableRow key={cat.id} className='transition-colors'>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        {cat.isRoot ? (
                          <div className='flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
                            <FolderTree className='size-3.5' />
                          </div>
                        ) : (
                          <div className='flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ml-4'>
                            <Folder className='size-3.5' />
                          </div>
                        )}
                        <span className='font-medium text-sm'>{cat.name}</span>
                        {cat.isRoot && (
                          <Badge variant='outline' className='text-[10px] px-1 py-0 font-normal'>
                            顶级
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {cat.parentName ? (
                        <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                          <span>归属于</span>
                          <Badge variant='secondary' className='text-xs font-normal'>
                            {cat.parentName}
                          </Badge>
                        </div>
                      ) : (
                        <span className='text-xs text-muted-foreground'>独立顶级分组</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span className='text-xs text-muted-foreground'>{cat.linkCount} 个链接</span>
                    </TableCell>

                    <TableCell>
                      {cat.isPrivate ? (
                        <Badge variant='secondary' className='gap-1 text-xs font-normal'>
                          <Shield className='size-3' />
                          私有
                        </Badge>
                      ) : (
                        <span className='text-xs text-muted-foreground'>公开</span>
                      )}
                    </TableCell>

                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        {cat.isRoot && (
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground'
                            onClick={() => openCreate(cat.id)}
                            title='在此分组下添加子分类'
                          >
                            <Plus className='size-3' />
                            <span className='hidden sm:inline'>子分类</span>
                          </Button>
                        )}
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7'
                          onClick={() => {
                            setEditItem(cat)
                            setEditName(cat.name)
                            setEditPrivate(cat.isPrivate)
                          }}
                          title='编辑'
                        >
                          <Edit2 className='size-3.5' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7 text-destructive hover:text-destructive'
                          onClick={() => {
                            setDeleteItem(cat)
                            setDeleteMode('delete')
                            setTargetCatId(undefined)
                          }}
                          title='删除'
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

          {/* Pagination */}
          {filteredCategories.length > 0 && (
            <div className='p-3'>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filteredCategories.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{parentId ? '新建子分类' : '新建分类'}</DialogTitle>
            <DialogDescription>
              选择上级分组可建立二级分类，留空则为独立主分组。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <Field label='分类名称' htmlFor='cat-name-input'>
              <Input
                id='cat-name-input'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='例如：开发工具'
                required
              />
            </Field>
            <Field label='上级分组（可选）' htmlFor='cat-parent-select'>
              <select
                id='cat-parent-select'
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
                className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              >
                <option value=''>作为独立主分组</option>
                {rootGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className='flex items-center gap-2 pt-1'>
              <input
                type='checkbox'
                id='cat-is-priv'
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className='size-4 rounded border-input text-primary focus:ring-ring'
              />
              <label htmlFor='cat-is-priv' className='text-sm text-foreground select-none cursor-pointer'>
                设为私有（仅管理员登录后可见）
              </label>
            </div>
            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? '创建中...' : '确认创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>编辑分类</DialogTitle>
            <DialogDescription>修改分类名称及访问可见性。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <Field label='分类名称' htmlFor='edit-cat-name'>
              <Input
                id='edit-cat-name'
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </Field>
            <div className='flex items-center gap-2 pt-1'>
              <input
                type='checkbox'
                id='edit-cat-priv'
                checked={editPrivate}
                onChange={(e) => setEditPrivate(e.target.checked)}
                className='size-4 rounded border-input text-primary focus:ring-ring'
              />
              <label htmlFor='edit-cat-priv' className='text-sm text-foreground select-none cursor-pointer'>
                设为私有分类
              </label>
            </div>
            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setEditItem(null)}>
                取消
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? '保存中...' : '确认保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='text-destructive'>删除分类</DialogTitle>
            <DialogDescription>
              确定要删除分类 <strong className='text-foreground'>{deleteItem?.name}</strong> 吗？
              涉及 {deleteItem?.linkCount} 个书签。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDelete} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <div className='space-y-2 text-sm'>
              <p className='font-medium text-foreground'>该分类下的书签如何处理？</p>
              <div className='flex items-center gap-2'>
                <input
                  type='radio'
                  id='del-casc'
                  name='deleteMode'
                  checked={deleteMode === 'delete'}
                  onChange={() => setDeleteMode('delete')}
                />
                <label htmlFor='del-casc' className='cursor-pointer text-xs'>
                  一并删除该分类下的所有书签
                </label>
              </div>
              <div className='flex items-center gap-2'>
                <input
                  type='radio'
                  id='del-mv'
                  name='deleteMode'
                  checked={deleteMode === 'move'}
                  onChange={() => setDeleteMode('move')}
                />
                <label htmlFor='del-mv' className='cursor-pointer text-xs'>
                  迁移书签至其他分类
                </label>
              </div>
            </div>

            {deleteMode === 'move' && (
              <Field label='迁移目标分类' htmlFor='target-select'>
                <select
                  id='target-select'
                  value={targetCatId ?? ''}
                  onChange={(e) => setTargetCatId(e.target.value ? Number(e.target.value) : undefined)}
                  className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                  required
                >
                  <option value=''>选择目标分类</option>
                  {flatCategories
                    .filter((c) => c.id !== deleteItem?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.isRoot ? '(主分组)' : ''}
                      </option>
                    ))}
                </select>
              </Field>
            )}

            <DialogFooter className='pt-2'>
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
