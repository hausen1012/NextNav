import { useState, useMemo, useEffect, Fragment } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Shield,
  Search,
  RotateCcw,
  ChevronRight,
  ChevronsUpDown,
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
import { CategoryIcon } from '@/components/CategoryIcon'
import { CategoryDialog } from '@/components/admin/CategoryDialog'
import { cn } from '@/lib/utils'

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

export function AdminCategoriesPage() {
  const { data: home, isLoading } = useHome()
  const invalidate = useInvalidateHome()

  // Filter & Search
  const [keyword, setKeyword] = useState('')
  const [selectedPrivacy, setSelectedPrivacy] = useState<'all' | 'public' | 'private'>('all')

  // Expanded root category IDs
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Sort
  const [sortField, setSortField] = useState<'name' | 'sort' | 'links'>('sort')
  const [sortAsc, setSortAsc] = useState(true)

  // Category Dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<FlatCategory | null>(null)
  const [defaultParentId, setDefaultParentId] = useState<number | undefined>(undefined)

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<FlatCategory | null>(null)
  const [deleteMode, setDeleteMode] = useState<'delete' | 'move'>('delete')
  const [targetCatId, setTargetCatId] = useState<number | undefined>(undefined)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const groups: GroupDTO[] = home?.groups || []

  // Flatten categories list for parent selection in dropdowns
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

  // All root categories that have child categories
  const rootsWithChildren = useMemo(() => {
    return groups.filter((g) => g.categories && g.categories.length > 0).map((g) => g.id)
  }, [groups])

  const isAllExpanded = rootsWithChildren.length > 0 && rootsWithChildren.every((id) => expandedIds.has(id))

  // Toggle single category expansion
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Toggle expand/collapse all
  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(rootsWithChildren))
    }
  }

  // Auto expand parent when searching keyword matches children
  useEffect(() => {
    if (keyword.trim()) {
      const q = keyword.toLowerCase()
      const autoExpand = new Set(expandedIds)
      for (const g of groups) {
        for (const c of (g.categories || []) as CategoryDTO[]) {
          if (
            c.name.toLowerCase().includes(q) ||
            (c.description && c.description.toLowerCase().includes(q))
          ) {
            autoExpand.add(g.id)
          }
        }
      }
      setExpandedIds(autoExpand)
    }
  }, [keyword, groups])

  // Check if an editing root category currently has child categories
  const editingHasChildren = useMemo(() => {
    if (!editingCategory || !editingCategory.isRoot) return false
    return flatCategories.some((c) => c.parentId === editingCategory.id)
  }, [editingCategory, flatCategories])

  // Filter and sort root groups and their children
  const displayGroups = useMemo(() => {
    const q = keyword.trim().toLowerCase()

    const filtered = groups
      .map((g) => {
        const rootMatch =
          !q ||
          g.name.toLowerCase().includes(q) ||
          (g.description && g.description.toLowerCase().includes(q))

        const matchedChildren = (g.categories || []).filter((c) => {
          if (selectedPrivacy === 'private' && !c.isPrivate) return false
          if (selectedPrivacy === 'public' && c.isPrivate) return false
          if (!q) return true
          return (
            c.name.toLowerCase().includes(q) ||
            (c.description && c.description.toLowerCase().includes(q))
          )
        })

        // Root passes if root matches or any child matches
        const hasContent = rootMatch || matchedChildren.length > 0
        if (!hasContent) return null

        // Privacy filter on root: root categories in DB are public by default
        if (selectedPrivacy === 'private' && !matchedChildren.some((c) => c.isPrivate)) {
          return null
        }

        // Sort children
        const sortedChildren = [...matchedChildren].sort((a, b) => {
          if (sortField === 'name') return (sortAsc ? 1 : -1) * a.name.localeCompare(b.name, 'zh')
          if (sortField === 'links') return (sortAsc ? 1 : -1) * ((a.links?.length ?? 0) - (b.links?.length ?? 0))
          const diff = a.sort - b.sort
          return diff !== 0 ? (sortAsc ? 1 : -1) * diff : (sortAsc ? 1 : -1) * (a.id - b.id)
        })

        return {
          ...g,
          categories: sortedChildren,
        }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)

    // Sort root groups
    return filtered.sort((a, b) => {
      if (sortField === 'name') return (sortAsc ? 1 : -1) * a.name.localeCompare(b.name, 'zh')
      if (sortField === 'links') return (sortAsc ? 1 : -1) * ((a.links?.length ?? 0) - (b.links?.length ?? 0))
      const diff = a.sort - b.sort
      return diff !== 0 ? (sortAsc ? 1 : -1) * diff : (sortAsc ? 1 : -1) * (a.id - b.id)
    })
  }, [groups, keyword, selectedPrivacy, sortField, sortAsc])

  const hasFilter = keyword.trim() !== '' || selectedPrivacy !== 'all'

  function resetFilters() {
    setKeyword('')
    setSelectedPrivacy('all')
  }

  function handleSort(field: 'name' | 'sort' | 'links') {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  function openCreate(defaultParentId?: number) {
    setEditingCategory(null)
    setDefaultParentId(defaultParentId)
    setFormOpen(true)
  }

  function openEdit(cat: FlatCategory) {
    setEditingCategory(cat)
    setDefaultParentId(undefined)
    setFormOpen(true)
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!deleteItem) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteCategory(deleteItem.id, deleteMode, targetCatId)
      invalidate()
      setDeleteItem(null)
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : '删除分类失败')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-4'>
      {/* Page Header */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-xl font-bold tracking-tight'>分类管理</h1>
          <p className='text-xs text-muted-foreground mt-0.5'>
            树形层级管理一级分类与二级子分类。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {rootsWithChildren.length > 0 && (
            <Button
              variant='outline'
              size='sm'
              onClick={toggleExpandAll}
              className='h-8 gap-1.5 text-xs'
              title={isAllExpanded ? '折叠全部子分类' : '展开全部子分类'}
            >
              <ChevronsUpDown className='size-3.5' />
              <span>{isAllExpanded ? '全部折叠' : '全部展开'}</span>
            </Button>
          )}
          <Button size='sm' className='h-8 gap-1.5' onClick={() => openCreate()}>
            <Plus className='size-4' />
            <span>新建分类</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-2.5 top-2.5 size-3.5 text-muted-foreground' />
            <Input
              placeholder='搜索分类名称或描述...'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className='h-8 pl-8 text-xs'
            />
          </div>

          <select
            value={selectedPrivacy}
            onChange={(e) => setSelectedPrivacy(e.target.value as 'all' | 'public' | 'private')}
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

      {/* Tree Table Card */}
      <Card className='shadow-xs'>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead
                  className='cursor-pointer select-none min-w-[240px]'
                  onClick={() => handleSort('name')}
                >
                  <span className='inline-flex items-center gap-1 font-semibold text-xs text-foreground'>
                    分类名称 {sortField === 'name' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead className='min-w-[160px]'>描述说明</TableHead>
                <TableHead
                  className='cursor-pointer select-none w-20 text-center'
                  onClick={() => handleSort('sort')}
                >
                  <span className='inline-flex w-full items-center justify-center gap-1 font-semibold text-xs text-foreground'>
                    排序 {sortField === 'sort' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead
                  className='cursor-pointer select-none w-24 text-center'
                  onClick={() => handleSort('links')}
                >
                  <span className='inline-flex w-full items-center justify-center gap-1 font-semibold text-xs text-foreground'>
                    直属链接 {sortField === 'links' && (sortAsc ? '↑' : '↓')}
                  </span>
                </TableHead>
                <TableHead className='w-20 text-center'>可见性</TableHead>
                <TableHead className='text-right w-40'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-28 text-center text-xs text-muted-foreground'>
                    正在加载分类...
                  </TableCell>
                </TableRow>
              ) : displayGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-28 text-center text-xs text-muted-foreground'>
                    {hasFilter ? '未找到符合条件的分类' : '暂无分类，请点击右上角新建'}
                  </TableCell>
                </TableRow>
              ) : (
                displayGroups.map((g) => {
                  const hasChildren = g.categories && g.categories.length > 0
                  const isExpanded = expandedIds.has(g.id)
                  const rootCat: FlatCategory = {
                    id: g.id,
                    name: g.name,
                    icon: g.icon,
                    iconUrl: g.iconUrl,
                    sort: g.sort,
                    description: g.description,
                    isPrivate: false,
                    linkCount: g.links?.length ?? 0,
                    isRoot: true,
                  }

                  return (
                    <Fragment key={g.id}>
                      {/* Root Category Row */}
                      <TableRow className='group/row font-medium bg-background hover:bg-muted/40 transition-colors'>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            {/* Expand/Collapse Chevron Button */}
                            {hasChildren ? (
                              <button
                                type='button'
                                onClick={() => toggleExpand(g.id)}
                                className='size-6 shrink-0 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-transform'
                                title={isExpanded ? '收起子分类' : '展开子分类'}
                              >
                                <ChevronRight
                                  className={cn(
                                    'size-4 transition-transform duration-200',
                                    isExpanded && 'rotate-90'
                                  )}
                                />
                              </button>
                            ) : (
                              <div className='size-6 shrink-0' />
                            )}

                            {/* Icon */}
                            <div className='flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-primary'>
                              <CategoryIcon
                                icon={g.icon || g.iconUrl}
                                isRoot={true}
                                className='size-4 text-primary'
                              />
                            </div>

                            {/* Name & Count */}
                            <span className='font-semibold text-sm text-foreground truncate'>
                              {g.name}
                            </span>
                            {hasChildren && (
                              <span className='text-xs text-muted-foreground font-normal'>
                                ({g.categories.length})
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <span
                            className='text-xs text-muted-foreground line-clamp-1'
                            title={g.description || undefined}
                          >
                            {g.description || '-'}
                          </span>
                        </TableCell>

                        <TableCell className='text-center'>
                          <span className='font-mono text-xs text-muted-foreground'>
                            {g.sort}
                          </span>
                        </TableCell>

                        <TableCell className='text-center'>
                          <span className='font-mono text-xs text-muted-foreground'>
                            {g.links?.length ?? 0}
                          </span>
                        </TableCell>

                        <TableCell className='text-center'>
                          <span className='text-xs text-muted-foreground'>公开</span>
                        </TableCell>

                        {/* Root Row Actions */}
                        <TableCell className='text-right'>
                          <div className='inline-flex items-center justify-end gap-1'>
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-7 px-1.5 text-xs gap-1 text-muted-foreground hover:text-foreground'
                              onClick={() => openCreate(g.id)}
                              title='在此分类下添加子分类'
                            >
                              <Plus className='size-3' />
                              <span>子分类</span>
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='size-7'
                              onClick={() => openEdit(rootCat)}
                              title='编辑分类'
                            >
                              <Edit2 className='size-3.5' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='size-7 text-destructive hover:text-destructive'
                              onClick={() => {
                                setDeleteItem(rootCat)
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

                      {/* Child Categories (Visible when expanded) */}
                      {hasChildren &&
                        isExpanded &&
                        g.categories.map((c) => {
                          const subCat: FlatCategory = {
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
                          }

                          return (
                            <TableRow
                              key={c.id}
                              className='bg-muted/15 hover:bg-muted/30 border-t border-border/50 transition-colors'
                            >
                              <TableCell>
                                <div className='flex items-center gap-2 pl-7'>
                                  {/* Tree branch line */}
                                  <span className='text-muted-foreground/60 select-none font-mono text-sm leading-none mr-0.5'>
                                    └
                                  </span>

                                  {/* Sub Icon */}
                                  <div className='flex size-6 shrink-0 items-center justify-center rounded bg-background border text-muted-foreground'>
                                    <CategoryIcon
                                      icon={c.icon || c.iconUrl}
                                      isRoot={false}
                                      className='size-3.5 text-muted-foreground'
                                    />
                                  </div>

                                  {/* Sub Name */}
                                  <span className='text-sm text-foreground/90 truncate'>
                                    {c.name}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell>
                                <span
                                  className='text-xs text-muted-foreground line-clamp-1'
                                  title={c.description || undefined}
                                >
                                  {c.description || '-'}
                                </span>
                              </TableCell>

                              <TableCell className='text-center'>
                                <span className='font-mono text-xs text-muted-foreground'>
                                  {c.sort}
                                </span>
                              </TableCell>

                              <TableCell className='text-center'>
                                <span className='font-mono text-xs text-muted-foreground'>
                                  {c.links?.length ?? 0}
                                </span>
                              </TableCell>

                              <TableCell className='text-center'>
                                {c.isPrivate ? (
                                  <span className='inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400'>
                                    <Shield className='size-3' />
                                    私有
                                  </span>
                                ) : (
                                  <span className='text-xs text-muted-foreground'>公开</span>
                                )}
                              </TableCell>

                              {/* Child Row Actions */}
                              <TableCell className='text-right'>
                                <div className='inline-flex items-center justify-end gap-1'>
                                  {/* Placeholder for +子分类 to maintain vertical alignment */}
                                  <div className='w-[60px]' />
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    className='size-7'
                                    onClick={() => openEdit(subCat)}
                                    title='编辑分类'
                                  >
                                    <Edit2 className='size-3.5' />
                                  </Button>
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    className='size-7 text-destructive hover:text-destructive'
                                    onClick={() => {
                                      setDeleteItem(subCat)
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
                          )
                        })}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Shared Category Dialog */}
      <CategoryDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        defaultParentId={defaultParentId}
        rootGroups={rootGroups}
        hasChildren={editingHasChildren}
        onSuccess={(pid) => {
          invalidate()
          if (pid) {
            setExpandedIds((prev) => new Set(prev).add(pid))
          }
        }}
      />

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
            {deleteError && <p className='text-xs text-destructive'>{deleteError}</p>}
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
