import { useState, useEffect, useRef } from 'react'
import type { LinkDTO } from '@/lib/api'
import { SiteIcon } from '@/components/SiteIcon'
import { ExternalLink, Copy, QrCode, Edit2, Trash2, Check, Lock, Activity } from 'lucide-react'

function StatusDot({ status }: { status: LinkDTO['status'] }) {
  if (status === 'dead') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-red-500' title='链接失效' />
  }
  if (status === 'warn') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-amber-400' title='响应较慢/异常' />
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
  onCheck?: (link: LinkDTO) => void
}

export function LinkCard({
  link,
  newTab,
  isAdmin,
  onShowQR,
  onEdit,
  onDelete,
  onCheck,
}: LinkCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => {
        setCopiedKey(null)
        setMenuPos(null)
      }, 1000)
    } catch {
      // ignore
    }
  }

  const openURL = (url: string) => {
    window.open(url, newTab ? '_blank' : '_self', newTab ? 'noopener,noreferrer' : undefined)
    setMenuPos(null)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 180)
    const y = Math.min(e.clientY, window.innerHeight - 220)
    setMenuPos({ x, y })
  }

  useEffect(() => {
    if (!menuPos) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null)
      }
    }
    const handleScroll = () => setMenuPos(null)
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [menuPos])

  return (
    <>
      <a
        href={link.url}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        onContextMenu={handleContextMenu}
        className='group relative flex items-center gap-3 rounded-2xl border border-transparent bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-black/[0.04] dark:border-transparent dark:bg-[#181a1f] dark:hover:bg-[#20232a] dark:hover:border-white/[0.06] select-none'
      >
        <StatusDot status={link.status} />

        {/* 网站图标容器 (纯圆满幅展示，无外圈白边) */}
        <div className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full'>
          <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} size={40} />
        </div>

        {/* 文本区域：两行展示（标题 + 描述） */}
        <div className='min-w-0 flex-1 pr-1'>
          <div className='flex items-center gap-1.5'>
            <span className='truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100'>
              {link.title}
            </span>
            {link.isPrivate ? (
              <span title='私有链接'>
                <Lock className='size-3 shrink-0 text-zinc-400' />
              </span>
            ) : null}
          </div>
          <p className='truncate text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-normal'>
            {link.description || '没有描述'}
          </p>
        </div>
      </a>

      {/* 原生轻量右键浮动菜单 */}
      {menuPos && (
        <div
          ref={menuRef}
          className='fixed z-50 min-w-40 rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-[#1a1d24]/95 text-xs text-zinc-700 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100'
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            type='button'
            onClick={() => openURL(link.url)}
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
          >
            <ExternalLink className='size-3.5 text-zinc-400' />
            <span>打开主链接</span>
          </button>

          {link.backupUrl ? (
            <button
              type='button'
              onClick={() => openURL(link.backupUrl!)}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
            >
              <ExternalLink className='size-3.5 text-zinc-400' />
              <span>打开备用链接</span>
            </button>
          ) : null}

          <button
            type='button'
            onClick={() => copyToClipboard(link.url, 'main')}
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
          >
            {copiedKey === 'main' ? (
              <Check className='size-3.5 text-green-500' />
            ) : (
              <Copy className='size-3.5 text-zinc-400' />
            )}
            <span>{copiedKey === 'main' ? '已复制主链接' : '复制主链接'}</span>
          </button>

          {link.backupUrl ? (
            <button
              type='button'
              onClick={() => copyToClipboard(link.backupUrl!, 'backup')}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
            >
              {copiedKey === 'backup' ? (
                <Check className='size-3.5 text-green-500' />
              ) : (
                <Copy className='size-3.5 text-zinc-400' />
              )}
              <span>{copiedKey === 'backup' ? '已复制备用链接' : '复制备用链接'}</span>
            </button>
          ) : null}

          <button
            type='button'
            onClick={() => {
              setMenuPos(null)
              onShowQR(link.url, link.title)
            }}
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
          >
            <QrCode className='size-3.5 text-zinc-400' />
            <span>二维码</span>
          </button>

          {isAdmin ? (
            <>
              <div className='my-1 border-t border-zinc-100 dark:border-zinc-800' />
              {onCheck ? (
                <button
                  type='button'
                  onClick={() => {
                    setMenuPos(null)
                    onCheck(link)
                  }}
                  className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
                >
                  <Activity className='size-3.5 text-zinc-400' />
                  <span>检测健康</span>
                </button>
              ) : null}
              {onEdit ? (
                <button
                  type='button'
                  onClick={() => {
                    setMenuPos(null)
                    onEdit(link)
                  }}
                  className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800'
                >
                  <Edit2 className='size-3.5 text-zinc-400' />
                  <span>编辑链接</span>
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type='button'
                  onClick={() => {
                    setMenuPos(null)
                    onDelete(link)
                  }}
                  className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                >
                  <Trash2 className='size-3.5' />
                  <span>删除链接</span>
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </>
  )
}
