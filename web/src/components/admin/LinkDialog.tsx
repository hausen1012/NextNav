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

export interface LinkDialogData {
  id?: number
  categoryId: number
  title: string
  url: string
  backupUrl?: string | null
  description?: string | null
  sort?: number
  isPrivate?: boolean
}

interface LinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  link?: LinkDialogData | null
  defaultCategoryId?: number
  categories: { id: number; name: string }[]
  onSuccess: () => void
}

export function LinkDialog({
  open,
  onOpenChange,
  link,
  defaultCategoryId,
  categories,
  onSuccess,
}: LinkDialogProps) {
  const isEdit = Boolean(link?.id)

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [backupUrl, setBackupUrl] = useState('')
  const [sortWeight, setSortWeight] = useState('10')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (link) {
        setTitle(link.title || '')
        setUrl(link.url || '')
        setCategoryId(link.categoryId || categories[0]?.id || 0)
        setDescription(link.description || '')
        setBackupUrl(link.backupUrl || '')
        setSortWeight(String(link.sort ?? 10))
        setIsPrivate(link.isPrivate ?? false)
      } else {
        setTitle('')
        setUrl('')
        setCategoryId(defaultCategoryId || categories[0]?.id || 0)
        setDescription('')
        setBackupUrl('')
        setSortWeight('10')
        setIsPrivate(false)
      }
    }
  }, [open, link, defaultCategoryId, categories])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const targetCatId = categoryId || categories[0]?.id
    if (!targetCatId) {
      setError('请先创建或选择分类')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEdit && link?.id) {
        await api.updateLink(link.id, {
          title: title.trim(),
          url: url.trim(),
          categoryId: targetCatId,
          description: description.trim() || null,
          backupUrl: backupUrl.trim() || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : 10,
          isPrivate,
        })
      } else {
        await api.createLink({
          title: title.trim(),
          url: url.trim(),
          categoryId: targetCatId,
          description: description.trim() || null,
          backupUrl: backupUrl.trim() || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : 10,
          isPrivate,
        })
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存链接失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑链接' : '新建链接'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改链接详细信息与归属分类。' : '录入新链接信息并保存。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4 pt-1'>
          {error && <p className='text-xs text-destructive'>{error}</p>}

          <Field label='链接名称' htmlFor='link-form-title'>
            <Input
              id='link-form-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='例如：Tailwind CSS'
              required
            />
          </Field>

          <Field label='网址 (URL)' htmlFor='link-form-url'>
            <Input
              id='link-form-url'
              type='url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='https://tailwindcss.com'
              required
            />
          </Field>

          <Field label='归属分类' htmlFor='link-form-cat'>
            <select
              id='link-form-cat'
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label='描述介绍（可选）' htmlFor='link-form-desc'>
            <Input
              id='link-form-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='快速实用的原子类 CSS 框架'
            />
          </Field>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <Field label='备用网址（可选）' htmlFor='link-form-backup'>
              <Input
                id='link-form-backup'
                type='url'
                value={backupUrl}
                onChange={(e) => setBackupUrl(e.target.value)}
                placeholder='备用镜像或备选站点'
              />
            </Field>

            <Field label='排序权重' htmlFor='link-form-sort'>
              <Input
                id='link-form-sort'
                type='number'
                value={sortWeight}
                onChange={(e) => setSortWeight(e.target.value)}
                placeholder='默认 10'
              />
            </Field>
          </div>

          <div className='flex items-center gap-2 pt-1'>
            <input
              type='checkbox'
              id='link-form-private'
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className='size-4 rounded border-input text-primary focus:ring-ring'
            />
            <label htmlFor='link-form-private' className='text-sm text-foreground select-none cursor-pointer'>
              设为私有链接（仅管理员可见）
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
