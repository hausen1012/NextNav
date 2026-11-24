import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'
import { CategoryIcon } from '@/components/CategoryIcon'

export interface CategoryDialogData {
  id?: number
  name: string
  icon?: string | null
  iconUrl?: string | null
  parentId?: number
  sort: number
  description?: string | null
  isPrivate: boolean
  isRoot?: boolean
}

export const PRESET_EMOJIS = ['📁', '🛠️', '🌐', '💻', '🎨', '🚀', '📚', '🎮', '📦', '⚙️', '⚡', '⭐', '🔍', '📱', '🔐', '📊']

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoryDialogData | null
  defaultParentId?: number
  rootGroups: { id: number; name: string }[]
  hasChildren?: boolean
  onSuccess: (parentId?: number) => void
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  defaultParentId,
  rootGroups,
  hasChildren = false,
  onSuccess,
}: CategoryDialogProps) {
  const isEdit = Boolean(category?.id)

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [parentId, setParentId] = useState<number | undefined>(defaultParentId)
  const [sortWeight, setSortWeight] = useState('10')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (category) {
        setName(category.name || '')
        const rawIcon = category.icon || (category.iconUrl && !category.iconUrl.startsWith('/icons/') ? category.iconUrl : '') || ''
        setIcon(rawIcon)
        setParentId(category.parentId)
        setSortWeight(String(category.sort ?? 10))
        setDescription(category.description || '')
        setIsPrivate(category.isPrivate ?? false)
      } else {
        setName('')
        setIcon('')
        setParentId(defaultParentId)
        setSortWeight('10')
        setDescription('')
        setIsPrivate(false)
      }
    }
  }, [open, category, defaultParentId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('分类名称不能为空')
      setIsSubmitting(false)
      return
    }

    try {
      if (isEdit && category?.id) {
        await api.updateCategory(category.id, {
          name: trimmedName,
          icon: icon.trim() || null,
          parentId: parentId || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : undefined,
          description: description.trim() || null,
          isPrivate,
        })
      } else {
        await api.createCategory({
          name: trimmedName,
          icon: icon.trim() || null,
          parentId: parentId || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : undefined,
          description: description.trim() || null,
          isPrivate,
        })
      }
      onSuccess(parentId)
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存分类失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑分类' : parentId ? '新建子分类' : '新建分类'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? '修改分类图标、名称、父级归属、排序与描述。'
              : '录入分类信息。未指定上级分类时自动作为一级分类。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4 pt-1'>
          {error && <p className='text-xs text-destructive'>{error}</p>}

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <Field label='分类名称' htmlFor='category-form-name'>
              <Input
                id='category-form-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='例如：开发工具'
                required
              />
            </Field>

            <Field label='排序' htmlFor='category-form-sort'>
              <Input
                id='category-form-sort'
                type='number'
                value={sortWeight}
                onChange={(e) => setSortWeight(e.target.value)}
                placeholder='数字越小越靠前，默认 10'
              />
            </Field>
          </div>

          <Field label='分类图标（可选）' htmlFor='category-form-icon'>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40'>
                  <CategoryIcon icon={icon} isRoot={!parentId} className='size-4 text-primary' />
                </div>
                <Input
                  id='category-form-icon'
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

          <Field
            label='上级分类（层级归属）'
            htmlFor='category-form-parent'
            hint={hasChildren ? '该主分类下包含子分类，无法移动为二级分类' : undefined}
          >
            <select
              id='category-form-parent'
              value={parentId ?? ''}
              disabled={hasChildren}
              onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : undefined)}
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            >
              <option value=''>无（一级分类）</option>
              {rootGroups
                .filter((g) => !category?.id || g.id !== category.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label='分类描述（可选）' htmlFor='category-form-desc'>
            <Input
              id='category-form-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='简要介绍该分类收录的内容或用途'
            />
          </Field>

          <div className='flex items-center gap-2 pt-1'>
            <input
              type='checkbox'
              id='category-form-private'
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className='size-4 rounded border-input text-primary focus:ring-ring'
            />
            <label htmlFor='category-form-private' className='text-sm text-foreground select-none cursor-pointer'>
              设为私有（仅管理员登录后可见）
            </label>
          </div>

          <DialogFooter className='pt-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : isEdit ? '保存更改' : '确认创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
