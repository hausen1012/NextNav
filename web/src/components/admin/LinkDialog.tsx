import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/query'
import { formatFaviconUrl } from '@/lib/utils'
import { Sparkles, Upload, Trash2, Globe } from 'lucide-react'
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
import { SiteIcon } from '@/components/SiteIcon'

export interface LinkDialogData {
  id?: number
  categoryId: number
  title: string
  url: string
  backupUrl?: string | null
  description?: string | null
  iconPath?: string | null
  iconUrl?: string | null
  customIconUrl?: string | null
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
  const { data: settings } = useSettings()
  const isEdit = Boolean(link?.id)

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [backupUrl, setBackupUrl] = useState('')
  const [iconPath, setIconPath] = useState('')
  const [iconLink, setIconLink] = useState('')
  const [sortWeight, setSortWeight] = useState('10')
  const [isPrivate, setIsPrivate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetchingMeta, setIsFetchingMeta] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)

  // Uploads need an existing link, so new links stage the file until save.
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null)
  const [stagedBlobUrl, setStagedBlobUrl] = useState<string | null>(null)

  async function handleIconFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) {
      setError('图标文件不能超过 1MB')
      return
    }
    setError(null)

    // 无论新建还是编辑，立即生成本地预览，提供 0 延迟视觉反馈
    if (stagedBlobUrl) {
      URL.revokeObjectURL(stagedBlobUrl)
    }
    const blobUrl = URL.createObjectURL(file)
    setStagedBlobUrl(blobUrl)

    if (!isEdit || !link?.id) {
      setPendingIconFile(file)
      return
    }
    setUploadingIcon(true)
    try {
      const updated = await api.uploadLinkIcon(link.id, file)
      setIconPath(updated.iconPath || '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '图标上传失败')
    } finally {
      setUploadingIcon(false)
    }
  }

  async function clearUploadedIcon() {
    if (stagedBlobUrl) {
      URL.revokeObjectURL(stagedBlobUrl)
    }
    setPendingIconFile(null)
    setStagedBlobUrl(null)
    setIconPath('')
    if (!isEdit || !link?.id) {
      return
    }
    setUploadingIcon(true)
    try {
      await api.clearLinkIcon(link.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除图标失败')
    } finally {
      setUploadingIcon(false)
    }
  }

  function applyFaviconApi() {
    const trimmed = url.trim()
    if (!trimmed) return
    if (settings?.site.faviconServiceUrl) {
      const generated = formatFaviconUrl(settings.site.faviconServiceUrl, trimmed)
      if (generated) {
        setIconLink(generated)
        return
      }
    }
    try {
      const u = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`)
      if (u.hostname) {
        setIconLink(`/api/favicon/${u.hostname}.png`)
      }
    } catch {
      // 忽略无法解析的 URL
    }
  }

  const globalFaviconUrl = formatFaviconUrl(settings?.site.faviconServiceUrl, url)

  const previewIconUrl = stagedBlobUrl
    ? stagedBlobUrl
    : iconPath
      ? `/${iconPath.replace(/^\//, '')}`
      : iconLink.trim()
        ? iconLink.trim()
        : globalFaviconUrl

  async function handleAutoFetch() {
    const trimmed = url.trim()
    if (!trimmed) return
    setIsFetchingMeta(true)
    setError(null)
    try {
      const meta = await api.fetchMeta(trimmed)
      if (meta.title && !title) setTitle(meta.title)
      if (meta.description && !description) setDescription(meta.description)
      if (meta.resolvedUrl && trimmed !== meta.resolvedUrl) setUrl(meta.resolvedUrl)
      if (meta.iconPath) {
        setIconPath(meta.iconPath)
      }
    } catch {
      // 抓取失败不打断流程
    } finally {
      setIsFetchingMeta(false)
    }
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setPendingIconFile(null)
      setStagedBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setUploadingIcon(false)
      if (link) {
        setTitle(link.title || '')
        setUrl(link.url || '')
        setCategoryId(link.categoryId || categories[0]?.id || 0)
        setDescription(link.description || '')
        setBackupUrl(link.backupUrl || '')
        setIconPath(link.iconPath || '')
        setIconLink(link.customIconUrl || '')
        setSortWeight(String(link.sort ?? 10))
        setIsPrivate(link.isPrivate ?? false)
      } else {
        setTitle('')
        setUrl('')
        setCategoryId(defaultCategoryId || categories[0]?.id || 0)
        setDescription('')
        setBackupUrl('')
        setIconPath('')
        setIconLink('')
        setSortWeight('10')
        setIsPrivate(false)
      }
    }
  }, [open, link?.id])

  useEffect(() => {
    return () => {
      if (stagedBlobUrl) {
        URL.revokeObjectURL(stagedBlobUrl)
      }
    }
  }, [stagedBlobUrl])

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
          iconPath: iconPath || null,
          iconUrl: iconLink.trim() || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : 10,
          isPrivate,
        })
      } else {
        const created = await api.createLink({
          title: title.trim(),
          url: url.trim(),
          categoryId: targetCatId,
          description: description.trim() || null,
          backupUrl: backupUrl.trim() || null,
          iconPath: iconPath || null,
          iconUrl: iconLink.trim() || null,
          sort: sortWeight.trim() !== '' ? Number(sortWeight) : 10,
          isPrivate,
        })
        if (pendingIconFile) {
          // A staged upload needs the new link id, so attach it after create.
          await api.uploadLinkIcon(created.id, pendingIconFile)
        }
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

          <Field label='网址 (URL)' htmlFor='link-form-url'>
            <div className='flex items-center gap-2'>
              <Input
                id='link-form-url'
                type='url'
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder='请输入有效链接，例如：https://tailwindcss.com'
                required
                className='flex-1'
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isFetchingMeta || !url.trim()}
                onClick={handleAutoFetch}
                className='shrink-0 gap-1 text-xs'
                title='自动抓取网页标题与描述'
              >
                <Sparkles className='size-3.5' />
                <span>{isFetchingMeta ? '抓取中...' : '自动获取'}</span>
              </Button>
            </div>
          </Field>

          <Field label='备用URL' htmlFor='link-form-backup'>
            <Input
              id='link-form-backup'
              type='url'
              value={backupUrl}
              onChange={(e) => setBackupUrl(e.target.value)}
              placeholder='请输入备用链接，如果没有，请留空'
            />
          </Field>

          <Field label='图标' htmlFor='link-form-icon-file'>
            <div className='flex items-center gap-3'>
              <div className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted/30'>
                <SiteIcon name={title || '?'} url={url} iconUrl={previewIconUrl} size={40} />
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <input
                  ref={iconInputRef}
                  type='file'
                  accept='image/png,image/jpeg,image/webp,image/x-icon'
                  className='hidden'
                  id='link-form-icon-file'
                  onChange={handleIconFileChange}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={uploadingIcon}
                  onClick={() => iconInputRef.current?.click()}
                  className='gap-1.5 text-xs'
                >
                  <Upload className='size-3.5' />
                  <span>{uploadingIcon ? '上传中...' : '上传图标'}</span>
                </Button>
                {iconPath || pendingIconFile ? (
                  <Button
                    type='button'
                    variant='destructive'
                    size='sm'
                    disabled={uploadingIcon}
                    onClick={clearUploadedIcon}
                    className='gap-1.5 text-xs'
                  >
                    <Trash2 className='size-3.5' />
                    <span>删除图标</span>
                  </Button>
                ) : null}
                <span className='text-[11px] text-muted-foreground'>
                  支持 PNG、JPEG、WebP、ICO，不超过 1MB
                </span>
              </div>
            </div>
          </Field>

          <Field label='图标链接' htmlFor='link-form-icon-link'>
            <div className='flex items-center gap-2'>
              <Input
                id='link-form-icon-link'
                value={iconLink}
                onChange={(e) => setIconLink(e.target.value)}
                placeholder='请输入图标链接，如果没有，请留空（可输入外部https链接）'
                className='flex-1'
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={!url.trim()}
                onClick={applyFaviconApi}
                className='shrink-0 gap-1 text-xs'
                title='自动填入本站 Favicon 抓取接口'
              >
                <Globe className='size-3.5' />
                <span>Favicon</span>
              </Button>
            </div>
          </Field>

          <Field label='链接名称' htmlFor='link-form-title'>
            <Input
              id='link-form-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='请输入链接名称，例如：Tailwind CSS'
              required
            />
          </Field>

          <Field label='所属分类' htmlFor='link-form-cat'>
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

          <Field label='权重' htmlFor='link-form-sort'>
            <Input
              id='link-form-sort'
              type='number'
              value={sortWeight}
              onChange={(e) => setSortWeight(e.target.value)}
              placeholder='默认 10'
            />
          </Field>

          <div className='flex items-center gap-2 pt-1'>
            <input
              type='checkbox'
              id='link-form-private'
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className='size-4 rounded border-input text-primary focus:ring-ring'
            />
            <label htmlFor='link-form-private' className='text-sm text-foreground select-none cursor-pointer'>
              是否私有（私有链接需要登录后才能查看！）
            </label>
          </div>

          <Field label='描述介绍（可选）' htmlFor='link-form-desc'>
            <Input
              id='link-form-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='快速实用的原子类 CSS 框架'
            />
          </Field>

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
