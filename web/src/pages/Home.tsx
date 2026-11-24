import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useHome, useMe, useInvalidateHome } from '@/lib/query'
import { api, type CategoryDTO, type GroupDTO, type LinkDTO } from '@/lib/api'
import { LinkCard } from '@/components/LinkCard'
import { QRCodeDialog } from '@/components/QRCodeDialog'
import { LinkDialog } from '@/components/admin/LinkDialog'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { hostOf } from '@/lib/utils'
import { TriangleAlert, Search, X, ArrowUpDown } from 'lucide-react'

function SortableLinkCard({
  link,
  newTab,
  isAdmin,
  isSorting,
  onShowQR,
  onEdit,
  onDelete,
}: {
  link: LinkDTO
  newTab: boolean
  isAdmin?: boolean
  isSorting?: boolean
  onShowQR: (url: string, title: string) => void
  onEdit?: (link: LinkDTO) => void
  onDelete?: (link: LinkDTO) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
    disabled: !isSorting,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...(isSorting ? { ...attributes, ...listeners } : {})}>
      <LinkCard
        link={link}
        newTab={newTab}
        isAdmin={isAdmin}
        onShowQR={onShowQR}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}

function LinkGrid({
  categoryId,
  links,
  newTab,
  isAdmin,
  isSorting,
  onShowQR,
  onEdit,
  onDelete,
  onReorder,
}: {
  categoryId: number
  links: LinkDTO[]
  newTab: boolean
  isAdmin?: boolean
  isSorting?: boolean
  onShowQR: (url: string, title: string) => void
  onEdit?: (link: LinkDTO) => void
  onDelete?: (link: LinkDTO) => void
  onReorder?: (categoryId: number, orderedIds: number[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const oldIndex = links.findIndex((l) => l.id === active.id)
    const newIndex = links.findIndex((l) => l.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(links, oldIndex, newIndex)
    onReorder(categoryId, reordered.map((l) => l.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={links.map((l) => l.id)} strategy={rectSortingStrategy}>
        <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
          {links.map((l) => (
            <SortableLinkCard
              key={l.id}
              link={l}
              newTab={newTab}
              isAdmin={isAdmin}
              isSorting={isSorting}
              onShowQR={onShowQR}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function Section({
  category,
  links,
  newTab,
  isAdmin,
  isSorting,
  onShowQR,
  onEdit,
  onDelete,
  onReorder,
}: {
  category: CategoryDTO
  links: LinkDTO[]
  newTab: boolean
  isAdmin?: boolean
  isSorting?: boolean
  onShowQR: (url: string, title: string) => void
  onEdit?: (link: LinkDTO) => void
  onDelete?: (link: LinkDTO) => void
  onReorder?: (categoryId: number, orderedIds: number[]) => void
}) {
  return (
    <section className='space-y-2.5'>
      <div className='flex items-center gap-1.5'>
        <CategoryIcon icon={category.icon || category.iconUrl} isRoot={false} className='size-3.5 text-muted-foreground' />
        <h3 className='text-sm font-medium text-muted-foreground'>{category.name}</h3>
        {category.description ? (
          <span className='text-xs text-muted-foreground/75 truncate font-normal'>- {category.description}</span>
        ) : null}
      </div>
      <LinkGrid
        categoryId={category.id}
        links={links}
        newTab={newTab}
        isAdmin={isAdmin}
        isSorting={isSorting}
        onShowQR={onShowQR}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
      />
    </section>
  )
}

function CategoryBlock({
  group,
  newTab,
  isAdmin,
  isSorting,
  onShowQR,
  onEdit,
  onDelete,
  onReorder,
}: {
  group: GroupDTO
  newTab: boolean
  isAdmin?: boolean
  isSorting?: boolean
  onShowQR: (url: string, title: string) => void
  onEdit?: (link: LinkDTO) => void
  onDelete?: (link: LinkDTO) => void
  onReorder?: (categoryId: number, orderedIds: number[]) => void
}) {
  const hasContent = group.links.length > 0 || group.categories.length > 0
  if (!hasContent) return null

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <div className='flex items-center gap-2'>
          <CategoryIcon icon={group.icon || group.iconUrl} isRoot={true} className='size-4 text-primary' />
          <h2 className='text-base font-semibold'>{group.name}</h2>
        </div>
        {group.description ? (
          <span className='text-xs text-muted-foreground'>{group.description}</span>
        ) : null}
      </div>
      {group.links.length > 0 ? (
        <LinkGrid
          categoryId={group.id}
          links={group.links}
          newTab={newTab}
          isAdmin={isAdmin}
          isSorting={isSorting}
          onShowQR={onShowQR}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ) : null}
      {group.categories.map((c: CategoryDTO) =>
        c.links.length > 0 ? (
          <Section
            key={c.id}
            category={c}
            links={c.links}
            newTab={newTab}
            isAdmin={isAdmin}
            isSorting={isSorting}
            onShowQR={onShowQR}
            onEdit={onEdit}
            onDelete={onDelete}
            onReorder={onReorder}
          />
        ) : null,
      )}
    </section>
  )
}

function HomeSkeleton() {
  return (
    <div className='space-y-8'>
      <div className='flex justify-between items-center'>
        <Skeleton className='h-4 w-48' />
        <Skeleton className='h-9 w-64 rounded-md' />
      </div>
      {[0, 1, 2].map((g) => (
        <div key={g} className='space-y-4'>
          <Skeleton className='h-5 w-24' />
          <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-[58px] rounded-lg' />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HomePage() {
  const { data, isLoading, error } = useHome()
  const { data: me } = useMe()
  const invalidate = useInvalidateHome()
  const [keyword, setKeyword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // QR Modal
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; title: string }>({
    open: false,
    url: '',
    title: '',
  })

  // Edit & Delete modal
  const [editingLink, setEditingLink] = useState<LinkDTO | null>(null)
  const [deletingLink, setDeletingLink] = useState<LinkDTO | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSorting, setIsSorting] = useState(false)

  const handleReorderLinks = async (categoryId: number, orderedIds: number[]) => {
    try {
      await api.reorderLinks(categoryId, orderedIds)
      invalidate()
    } catch (err) {
      console.error('Reorder links failed', err)
    }
  }

  const categories = useMemo(() => {
    if (!data?.groups) return []
    const list: { id: number; name: string }[] = []
    for (const g of data.groups) {
      list.push({ id: g.id, name: g.name })
      for (const c of g.categories) {
        list.push({ id: c.id, name: `${g.name} / ${c.name}` })
      }
    }
    return list
  }, [data?.groups])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInputActive = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && !isInputActive) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setKeyword('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const { filteredGroups, totalMatched } = useMemo(() => {
    if (!data?.groups) return { filteredGroups: [], totalMatched: 0 }
    const q = keyword.trim().toLowerCase()
    if (!q) {
      const count = data.groups.reduce((acc, g) => {
        return acc + g.links.length + g.categories.reduce((cAcc, c) => cAcc + c.links.length, 0)
      }, 0)
      return { filteredGroups: data.groups, totalMatched: count }
    }

    let matchCount = 0
    const groups: GroupDTO[] = []

    for (const group of data.groups) {
      const groupNameMatch = group.name.toLowerCase().includes(q)

      const matchedDirectLinks = group.links.filter((l) => {
        return (
          groupNameMatch ||
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          hostOf(l.url).toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q))
        )
      })

      const matchedCategories: CategoryDTO[] = []
      for (const cat of group.categories) {
        const catNameMatch = groupNameMatch || cat.name.toLowerCase().includes(q)
        const matchedCatLinks = cat.links.filter((l) => {
          return (
            catNameMatch ||
            l.title.toLowerCase().includes(q) ||
            l.url.toLowerCase().includes(q) ||
            hostOf(l.url).toLowerCase().includes(q) ||
            (l.description && l.description.toLowerCase().includes(q))
          )
        })
        if (matchedCatLinks.length > 0) {
          matchCount += matchedCatLinks.length
          matchedCategories.push({
            ...cat,
            links: matchedCatLinks,
          })
        }
      }

      matchCount += matchedDirectLinks.length
      if (matchedDirectLinks.length > 0 || matchedCategories.length > 0) {
        groups.push({
          ...group,
          links: matchedDirectLinks,
          categories: matchedCategories,
        })
      }
    }

    return { filteredGroups: groups, totalMatched: matchCount }
  }, [data?.groups, keyword])

  const handleDelete = async () => {
    if (!deletingLink) return
    setIsDeleting(true)
    try {
      await api.deleteLink(deletingLink.id)
      invalidate()
      setDeletingLink(null)
    } catch (err) {
      console.error('Delete link failed', err)
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <HomeSkeleton />
  }
  if (error) {
    return (
      <Alert variant='destructive'>
        <TriangleAlert />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }
  if (!data) return null

  const isInitialEmpty = data.groups.every(
    (g) => g.links.length === 0 && g.categories.every((c) => c.links.length === 0),
  )

  const showQR = (url: string, title: string) => {
    setQrModal({ open: true, url, title })
  }

  return (
    <div className='space-y-6'>
      {/* Search Header Bar */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          {data.site.description ? (
            <p className='text-sm text-muted-foreground'>{data.site.description}</p>
          ) : null}
        </div>
        {!isInitialEmpty ? (
          <div className='flex items-center gap-2 w-full sm:w-auto justify-end'>
            {me?.auth === 'admin' && !keyword ? (
              <Button
                variant={isSorting ? 'default' : 'outline'}
                size='sm'
                onClick={() => setIsSorting(!isSorting)}
                className='h-9 gap-1.5 text-xs shrink-0'
                title='切换卡片拖拽排序模式'
              >
                <ArrowUpDown className='size-3.5' />
                <span>{isSorting ? '完成排序' : '卡片排序'}</span>
              </Button>
            ) : null}
            <div className='relative w-full sm:w-72 md:w-80'>
              <Search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                ref={inputRef}
                type='search'
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='极速搜索链接或分类...'
                className='h-9 bg-card/60 pl-8 pr-14 backdrop-blur'
              />
              {keyword ? (
                <button
                  type='button'
                  onClick={() => {
                    setKeyword('')
                    inputRef.current?.focus()
                  }}
                  className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground'
                  title='清空搜索'
                  aria-label='清空搜索'
                >
                  <X className='size-3.5' />
                </button>
              ) : (
                <kbd className='pointer-events-none absolute right-2.5 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex'>
                  /
                </kbd>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {isInitialEmpty ? (
        <div className='rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>暂无链接数据。</p>
          <Link to='/admin/links' className='mt-3 inline-block text-sm text-primary hover:underline'>
            前往后台添加链接
          </Link>
        </div>
      ) : keyword.trim() && totalMatched === 0 ? (
        <div className='rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>未找到与 “{keyword}” 相关的链接。</p>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setKeyword('')
              inputRef.current?.focus()
            }}
            className='mt-3 text-sm text-primary hover:underline'
          >
            清空搜索
          </Button>
        </div>
      ) : (
        <>
          {keyword.trim() ? (
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>找到 {totalMatched} 个相关链接</span>
              <button
                type='button'
                onClick={() => setKeyword('')}
                className='hover:text-foreground hover:underline'
              >
                清除筛选
              </button>
            </div>
          ) : null}
          <div className='space-y-8'>
            {filteredGroups.map((g) => (
              <CategoryBlock
                key={g.id}
                group={g}
                newTab={data.site.openInNewTab}
                isAdmin={me?.auth === 'admin'}
                isSorting={isSorting && !keyword}
                onShowQR={showQR}
                onEdit={(l) => setEditingLink(l)}
                onDelete={(l) => setDeletingLink(l)}
                onReorder={handleReorderLinks}
              />
            ))}
          </div>
        </>
      )}

      {/* QR Code Dialog */}
      <QRCodeDialog
        open={qrModal.open}
        onOpenChange={(open) => setQrModal((prev) => ({ ...prev, open }))}
        url={qrModal.url}
        title={qrModal.title}
      />

      {/* Edit Link Dialog */}
      {editingLink ? (
        <LinkDialog
          open={Boolean(editingLink)}
          onOpenChange={(open) => !open && setEditingLink(null)}
          link={editingLink}
          categories={categories}
          onSuccess={() => {
            invalidate()
            setEditingLink(null)
          }}
        />
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deletingLink)} onOpenChange={(open) => !open && setDeletingLink(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>确认删除链接</DialogTitle>
            <DialogDescription>
              是否确定删除 “{deletingLink?.title}”？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:justify-end'>
            <Button variant='outline' onClick={() => setDeletingLink(null)} disabled={isDeleting}>
              取消
            </Button>
            <Button variant='destructive' onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? '正在删除...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
