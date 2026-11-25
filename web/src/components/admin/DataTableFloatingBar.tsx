import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableFloatingBarProps {
  selectedCount: number
  onClearSelection: () => void
  children?: ReactNode
  className?: string
}

export function DataTableFloatingBar({
  selectedCount,
  onClearSelection,
  children,
  className,
}: DataTableFloatingBarProps) {
  // 监听 Esc 键快捷取消所有选择
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && selectedCount > 0) {
        onClearSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCount, onClearSelection])

  if (selectedCount <= 0) return null

  return (
    <div
      role='toolbar'
      aria-label='批量操作栏'
      className={cn(
        'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
        'flex items-center gap-2 rounded-xl border bg-background/95 p-1.5 shadow-xl backdrop-blur-md',
        'animate-in fade-in-0 slide-in-from-bottom-5 duration-200',
        className
      )}
    >
      <div className='flex items-center gap-1.5 pl-1 pr-1.5'>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 rounded-lg text-muted-foreground hover:text-foreground'
          onClick={onClearSelection}
          title='取消选择 (Esc)'
        >
          <X className='size-3.5' />
          <span className='sr-only'>取消选择</span>
        </Button>
        <div className='flex items-center gap-1.5'>
          <span className='inline-flex min-w-5 items-center justify-center rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background'>
            {selectedCount}
          </span>
          <span className='text-xs font-medium text-foreground whitespace-nowrap'>
            项已选择
          </span>
        </div>
      </div>

      {children && (
        <>
          <div className='h-4 w-px bg-border' />
          <div className='flex items-center gap-1.5 pr-1'>
            {children}
          </div>
        </>
      )}
    </div>
  )
}
