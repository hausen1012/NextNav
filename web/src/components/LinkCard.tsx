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
        className='group relative flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800/80 dark:bg-[#1a1d24] select-none'
      >
        <StatusDot status={link.status} />

        {/* 管理员悬浮快捷操作按钮 */}
        {isAdmin && (
          <div className='absolute right-2 top-2 hidden group-hover:flex items-center gap-1 z-10 animate-in fade-in duration-150'>
            {onEdit && (
              <button
                type='button'
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEdit(link)
                }}
                className='flex size-6 items-center justify-center rounded-md bg-white/95 text-slate-500 shadow-xs border border-slate-200 hover:text-zinc-900 hover:border-zinc-400 dark:bg-neutral-800/95 dark:text-neutral-400 dark:border-neutral-700 dark:hover:text-white dark:hover:border-zinc-500 transition'
                title='编辑链接'
              >
                <Edit2 className='size-3' />
              </button>
            )}
            {onDelete && (
              <button
                type='button'
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete(link)
                }}
                className='flex size-6 items-center justify-center rounded-md bg-white/95 text-slate-500 shadow-xs border border-slate-200 hover:text-red-600 hover:border-red-300 dark:bg-neutral-800/95 dark:text-neutral-400 dark:border-neutral-700 dark:hover:text-red-400 transition'
                title='删除链接'
              >
                <Trash2 className='size-3' />
              </button>
            )}
          </div>
        )}

        {/* 网站图标容器 (纯圆形，暗黑模式无白边) */}
        <div className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100/80 dark:bg-zinc-800/80'>
          <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} size={36} />
        </div>

        {/* 文本区域：两行展示（标题 + 描述） */}
        <div className='min-w-0 flex-1 pr-1'>
          <div className='flex items-center gap-1.5'>
            <span className='truncate text-sm font-semibold text-slate-800 dark:text-slate-100'>
              {link.title}
            </span>
            {link.isPrivate ? (
              <span title='私有链接'>
                <Lock className='size-3 shrink-0 text-slate-400' />
              </span>
            ) : null}
          </div>
          <p className='truncate text-xs text-slate-400 dark:text-neutral-500 mt-0.5 font-normal'>
            {link.description || '没有描述'}
          </p>
        </div>
      </a>

      {/* 原生轻量右键浮动菜单 */}
      {menuPos && (
        <div
          ref={menuRef}
          className='fixed z-50 min-w-40 rounded-xl border border-slate-100 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95 text-xs text-slate-700 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-100'
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            type='button'
            onClick={() => openURL(link.url)}
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
          >
            <ExternalLink className='size-3.5 text-slate-400' />
            <span>打开主链接</span>
          </button>

          {link.backupUrl ? (
            <button
              type='button'
              onClick={() => openURL(link.backupUrl!)}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
            >
              <ExternalLink className='size-3.5 text-slate-400' />
              <span>打开备用链接</span>
            </button>
          ) : null}

          <button
            type='button'
            onClick={() => copyToClipboard(link.url, 'main')}
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
          >
            {copiedKey === 'main' ? (
              <Check className='size-3.5 text-green-500' />
            ) : (
              <Copy className='size-3.5 text-slate-400' />
            )}
            <span>{copiedKey === 'main' ? '已复制主链接' : '复制主链接'}</span>
          </button>

          {link.backupUrl ? (
            <button
              type='button'
              onClick={() => copyToClipboard(link.backupUrl!, 'backup')}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
            >
              {copiedKey === 'backup' ? (
                <Check className='size-3.5 text-green-500' />
              ) : (
                <Copy className='size-3.5 text-slate-400' />
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
            className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
          >
            <QrCode className='size-3.5 text-slate-400' />
            <span>二维码</span>
          </button>

          {isAdmin ? (
            <>
              <div className='my-1 border-t border-slate-100 dark:border-neutral-800' />
              {onCheck ? (
                <button
                  type='button'
                  onClick={() => {
                    setMenuPos(null)
                    onCheck(link)
                  }}
                  className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
                >
                  <Activity className='size-3.5 text-slate-400' />
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
                  className='flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-neutral-800'
                >
                  <Edit2 className='size-3.5 text-slate-400' />
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
