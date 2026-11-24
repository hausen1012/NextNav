import { useState } from 'react'
import type { LinkDTO } from '@/lib/api'
import { SiteIcon } from '@/components/SiteIcon'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ExternalLink, Copy, QrCode, Edit2, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

function StatusDot({ status }: { status: LinkDTO['status'] }) {
  if (status === 'dead') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-red-500' title='链接失效' />
  }
  if (status === 'warn') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-amber-400' title='响应较慢' />
  }
  return null
}

interface LinkCardProps {
  link: LinkDTO
  newTab: boolean
  isAdmin?: boolean
  onShowQR: (url: string, title: string) => void
  onEdit?: (link: LinkDTO) => void
  onDelete?: (link: LinkDTO) => void
}

export function LinkCard({
  link,
  newTab,
  isAdmin,
  onShowQR,
  onEdit,
  onDelete,
}: LinkCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      // ignore
    }
  }

  const openURL = (url: string) => {
    window.open(url, newTab ? '_blank' : '_self', newTab ? 'noopener,noreferrer' : undefined)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <a
          href={link.url}
          target={newTab ? '_blank' : undefined}
          rel={newTab ? 'noopener noreferrer' : undefined}
          className={cn(
            'group relative flex h-[62px] items-center gap-3 rounded-lg border bg-card p-3',
            'transition hover:-translate-y-0.5 hover:shadow-md select-none',
          )}
        >
          <StatusDot status={link.status} />
          <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>
              {link.title}
              {link.isPrivate ? (
                <Badge variant='secondary' className='ml-1.5 align-middle text-[10px]'>
                  私有
                </Badge>
              ) : null}
            </span>
            {link.description ? (
              <span className='block truncate text-xs text-muted-foreground'>{link.description}</span>
            ) : null}
          </span>
        </a>
      </ContextMenuTrigger>
      <ContextMenuContent className='w-48'>
        <ContextMenuItem onClick={() => openURL(link.url)} className='gap-2'>
          <ExternalLink className='size-3.5' />
          打开主链接
        </ContextMenuItem>
        {link.backupUrl ? (
          <ContextMenuItem onClick={() => openURL(link.backupUrl!)} className='gap-2'>
            <ExternalLink className='size-3.5' />
            打开备用链接
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onClick={() => copyToClipboard(link.url, 'main')}
          className='gap-2'
        >
          {copiedKey === 'main' ? <Check className='size-3.5 text-green-500' /> : <Copy className='size-3.5' />}
          {copiedKey === 'main' ? '主链接已复制' : '复制主链接'}
        </ContextMenuItem>
        {link.backupUrl ? (
          <ContextMenuItem
            onClick={() => copyToClipboard(link.backupUrl!, 'backup')}
            className='gap-2'
          >
            {copiedKey === 'backup' ? <Check className='size-3.5 text-green-500' /> : <Copy className='size-3.5' />}
            {copiedKey === 'backup' ? '备用链接已复制' : '复制备用链接'}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={() => onShowQR(link.url, link.title)} className='gap-2'>
          <QrCode className='size-3.5' />
          二维码
        </ContextMenuItem>
        {isAdmin ? (
          <>
            <ContextMenuSeparator />
            {onEdit ? (
              <ContextMenuItem onClick={() => onEdit(link)} className='gap-2'>
                <Edit2 className='size-3.5' />
                编辑链接
              </ContextMenuItem>
            ) : null}
            {onDelete ? (
              <ContextMenuItem
                onClick={() => onDelete(link)}
                variant='destructive'
                className='gap-2'
              >
                <Trash2 className='size-3.5' />
                删除链接
              </ContextMenuItem>
            ) : null}
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
