import { useState, useMemo } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Shield,
  Search,
  RotateCcw,
} from 'lucide-react'
import { useHome, useInvalidateHome } from '@/lib/query'
import { api, type GroupDTO, type CategoryDTO } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { CategoryIcon } from '@/components/CategoryIcon'

export interface FlatCategory {
  id: number
  name: string
  icon?: string | null
  iconUrl?: string | null
  parentId?: number
  parentName?: string
  sort: number
  isPrivate: boolean
  description?: string | null
  linkCount: number
  isRoot: boolean
}

const PRESET_EMOJIS = ['📁', '🛠️', '🌐', '💻', '🎨', '🚀', '📚', '🎮', '📦', '⚙️', '⚡', '⭐', '🔍', '📱', '🔐', '📊']

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
  const [sortField, setSortField] = useState<'name' | 'parent' | 'sort' | 'links'>('sort')
  const [sortAsc, setSortAsc] = useState(true)

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [parentId, setParentId] = useState<number | undefined>(undefined)
  const [sortWeight, setSortWeight] = useState<string>('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [editItem, setEditItem] = useState<FlatCategory | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editParentId, setEditParentId] = useState<number | undefined>(undefined)
  const [editSortWeight, setEditSortWeight] = useState<string>('')
  const [editDescription, setEditDescription] = useState('')
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
        icon: g.icon,
        iconUrl: g.iconUrl,
        sort: g.sort,
        description: g.description,
        isPrivate: false,
        linkCount: g.links?.length ?? 0,
        isRoot: true,
      })
      for (const c of (g.categories || []) as CategoryDTO[]) {
        list.push({
          id: c.id,
          name: c.name,
          icon: c.icon,
          iconUrl: c.iconUrl,
          parentId: g.id,
          parentName: g.name,
          sort: c.sort,
          description: c.description,
          isPrivate: c.isPrivate,
          linkCount: c.links?.length ?? 0,
          isRoot: false,
        })
      }
    }
    return { flatCategories: list, rootGroups: roots }
  }, [groups])

  // Check if an editing root category currently has child categories
  const editingHasChildren = useMemo(() => {
    if (!editItem || !editItem.isRoot) return false
    return flatCategories.some((c) => c.parentId === editItem.id)
  }, [editItem, flatCategories])

  // Filter & Sort
  const filteredCategories = useMemo(() => {
    let list = flatCategories.filter((cat) => {
      if (keyword.trim()) {
        const q = keyword.toLowerCase()
        const matchName = cat.name.toLowerCase().includes(q)
        const matchParent = cat.parentName?.toLowerCase().includes(q)
        const matchDesc = cat.description?.toLowerCase().includes(q)
        if (!matchName && !matchParent && !matchDesc) return false
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
      else if (sortField === 'sort') cmp = a.sort - b.sort
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

  function handleSort(field: 'name' | 'parent' | 'sort' | 'links') {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  function openCreate(defaultParentId?: number) {
    setName('')
    setIcon('')
    setParentId(defaultParentId)
    setSortWeight('')
    setDescription('')
    setIsPrivate(false)
    setError(null)
    setCreateOpen(true)
  }

  function openEdit(cat: FlatCategory) {
    setEditItem(cat)
    setEditName(cat.name)
    setEditIcon(cat.icon || (cat.iconUrl && !cat.iconUrl.startsWith('/icons/') ? cat.iconUrl : '') || '')
    setEditParentId(cat.parentId)
    setEditSortWeight(String(cat.sort))
    setEditDescription(cat.description || '')
    setEditPrivate(cat.isPrivate)
    setError(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await api.createCategory({
        name: name.trim(),
        icon: icon.trim() || null,
        parentId: parentId || null,
        sort: sortWeight.trim() !== '' ? Number(sortWeight) : undefined,
        description: description.trim() || null,
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
        name: editName.trim(),
        icon: editIcon.trim() || null,
        parentId: editParentId ?? 0,
        sort: editSortWeight.trim() !== '' ? Number(editSortWeight) : undefined,
        description: editDescription.trim() || null,
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
          <h1 className='text-xl font-bold tracking-tight'>分类管理</h1>
          <p className='text-xs text-muted-foreground mt-0.5'>
            配置导航站分类层级、显示排序与可见权限
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
              placeholder='搜索分类名、上级分类或描述...'
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                setPage(1)
              }}
              className='h-8 pl-8 text-xs'
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as 'all' | 'root' | 'sub')
              setPage(1)
            }}
            className='h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>全部层级</option>
            <option value='root'>仅一级分类</option>
            <option value='sub'>仅二级分类</option>
          </select>

          <select
            value={selectedPrivacy}
            onChange={(e) => {
              setSelectedPrivacy(e.target.value as 'all' | 'public' | 'private')
              setPage(1)
            }}
            className='h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
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
              className='h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
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
                <TableHead className='w-14 text-center'>图标</TableHead>
                <TableHead
                  className='cursor-pointer select-none w-[200px]'
                  onClick={() => handleSort('name')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    分类名称 {sortField === 'name' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead className='min-w-[140px]'>描述</TableHead>
                <TableHead
                  className='cursor-pointer select-none w-[140px]'
                  onClick={() => handleSort('parent')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    层级归属 {sortField === 'parent' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none w-20 text-center'
                  onClick={() => handleSort('sort')}
                >
                  <span className='inline-flex w-full items-center justify-center gap-1 font-semibold text-xs text-foreground'>
                    权重 {sortField === 'sort' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none w-24'
                  onClick={() => handleSort('links')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    链接数 {sortField === 'links' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead className='w-20'>可见性</TableHead>
                <TableHead className='text-right w-36'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className='h-28 text-center text-xs text-muted-foreground'>
                    正在加载分类...
                  </TableCell>
                </TableRow>
              ) : paginatedCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='h-28 text-center text-xs text-muted-foreground'>
                    {hasFilter ? '未找到符合条件的分类' : '暂无分类，请点击右上角新建'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCategories.map((cat) => (
                  <TableRow key={cat.id} className='transition-colors'>
                    <TableCell className='text-center'>
                      <div className='flex size-8 mx-auto items-center justify-center rounded-md bg-muted/60 text-foreground'>
                        <CategoryIcon
                          icon={cat.icon || cat.iconUrl}
                          isRoot={cat.isRoot}
                          className={cat.isRoot ? 'size-4 text-primary' : 'size-4 text-muted-foreground'}
                        />
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className='flex items-center gap-1.5'>
                        <span className={cat.isRoot ? 'font-medium text-sm text-foreground' : 'text-sm text-foreground/90 pl-2'}>
                          {!cat.isRoot && <span className='text-muted-foreground mr-1'>└</span>}
                          {cat.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className='text-xs text-muted-foreground line-clamp-1' title={cat.description || undefined}>
                        {cat.description || '-'}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className='text-xs text-muted-foreground'>
                        {cat.parentName || '一级分类'}
                      </span>
                    </TableCell>

                    <TableCell className='text-center'>
                      <span className='font-mono text-xs text-muted-foreground'>
                        {cat.sort}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className='text-xs text-muted-foreground font-mono'>{cat.linkCount}</span>
                    </TableCell>

                    <TableCell>
                      {cat.isPrivate ? (
                        <span className='inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400'>
                          <Shield className='size-3' />
                          私有
                        </span>
                      ) : (
                        <span className='text-xs text-muted-foreground'>公开</span>
                      )}
                    </TableCell>

                    <TableCell className='text-right'>
                      <div className='inline-flex items-center justify-end gap-1'>
                        <div className='w-16 flex justify-end'>
                          {cat.isRoot && (
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-7 px-1.5 text-xs gap-1 text-muted-foreground hover:text-foreground'
                              onClick={() => openCreate(cat.id)}
                              title='在此分类下添加子分类'
                            >
                              <Plus className='size-3' />
                              <span>子分类</span>
                            </Button>
                          )}
                        </div>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-7'
                          onClick={() => openEdit(cat)}
                          title='编辑分类'
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
                          title='删除分类'
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
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{parentId ? '新建子分类' : '新建分类'}</DialogTitle>
            <DialogDescription>
              录入分类信息。未指定上级分类时自动作为一级分类。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className='space-y-4 pt-1'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <Field label='分类名称' htmlFor='cat-name-input'>
                <Input
                  id='cat-name-input'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='例如：开发工具'
                  required
                />
              </Field>

              <Field label='权重 / 排序' htmlFor='cat-sort-input'>
                <Input
                  id='cat-sort-input'
                  type='number'
                  value={sortWeight}
                  onChange={(e) => setSortWeight(e.target.value)}
                  placeholder='数值越小越靠前'
                />
              </Field>
            </div>

            <Field label='分类图标（可选）' htmlFor='cat-icon-input'>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <div className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40'>
                    <CategoryIcon icon={icon} isRoot={!parentId} className='size-4 text-primary' />
                  </div>
                  <Input
                    id='cat-icon-input'
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder='输入 Emoji (如 🚀)、Lucide 图标名或图片 URL'
                    className='flex-1'
                  />
                </div>
                <div className='flex flex-wrap items-center gap-1 pt-0.5'>
                  <span className='text-[11px] text-muted-foreground mr-1'>快捷推荐:</span>
                  {PRESET_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type='button'
                      onClick={() => setIcon(emoji)}
                      className='px-1.5 py-0.5 text-xs hover:bg-accent rounded transition'
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label='上级分类（可选）' htmlFor='cat-parent-select'>
              <select
                id='cat-parent-select'
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
                className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              >
                <option value=''>无（一级分类）</option>
                {rootGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label='分类描述（可选）' htmlFor='cat-desc-input'>
              <Input
                id='cat-desc-input'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='简要介绍该分类收录的内容或用途'
              />
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
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>编辑分类</DialogTitle>
            <DialogDescription>修改分类图标、名称、父级归属、权重与描述。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className='space-y-4 pt-1'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              <Field label='分类名称' htmlFor='edit-cat-name'>
                <Input
                  id='edit-cat-name'
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder='例如：开发工具'
                  required
                />
              </Field>

              <Field label='权重 / 排序' htmlFor='edit-cat-sort'>
                <Input
                  id='edit-cat-sort'
                  type='number'
                  value={editSortWeight}
                  onChange={(e) => setEditSortWeight(e.target.value)}
                  placeholder='数值越小越靠前'
                />
              </Field>
            </div>

            <Field label='分类图标（可选）' htmlFor='edit-cat-icon'>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <div className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40'>
                    <CategoryIcon icon={editIcon} isRoot={!editParentId} className='size-4 text-primary' />
                  </div>
                  <Input
                    id='edit-cat-icon'
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    placeholder='输入 Emoji (如 🚀)、Lucide 图标名或图片 URL'
                    className='flex-1'
                  />
                </div>
                <div className='flex flex-wrap items-center gap-1 pt-0.5'>
                  <span className='text-[11px] text-muted-foreground mr-1'>快捷推荐:</span>
                  {PRESET_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type='button'
                      onClick={() => setEditIcon(emoji)}
                      className='px-1.5 py-0.5 text-xs hover:bg-accent rounded transition'
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label='上级分类（层级归属）' htmlFor='edit-cat-parent'>
              <select
                id='edit-cat-parent'
                value={editParentId ?? ''}
                disabled={editingHasChildren}
                onChange={(e) => setEditParentId(e.target.value ? Number(e.target.value) : undefined)}
                className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50'
              >
                <option value=''>无（一级分类）</option>
                {rootGroups
                  .filter((g) => g.id !== editItem?.id)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
              {editingHasChildren && (
                <p className='text-[11px] text-muted-foreground mt-1'>
                  已有子分类，无法调整为二级分类。
                </p>
              )}
            </Field>

            <Field label='分类描述（可选）' htmlFor='edit-cat-desc'>
              <Input
                id='edit-cat-desc'
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder='简要介绍该分类收录的内容或用途'
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
                设为私有分类（仅管理员登录后可见）
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
              涉及 {deleteItem?.linkCount} 个链接。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDelete} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <div className='space-y-2 text-sm'>
              <p className='font-medium text-foreground'>该分类下的链接如何处理？</p>
              <div className='flex items-center gap-2'>
                <input
                  type='radio'
                  id='del-casc'
                  name='deleteMode'
                  checked={deleteMode === 'delete'}
                  onChange={() => setDeleteMode('delete')}
                />
                <label htmlFor='del-casc' className='cursor-pointer text-xs'>
                  一并删除该分类下的所有链接
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
                  迁移链接至其他分类
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
                        {c.name} {c.isRoot ? '(一级分类)' : ''}
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
