import * as React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface DataTableColumnHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  canSort?: boolean
  isSorted?: 'asc' | 'desc' | false
  onToggle?: () => void
  align?: 'left' | 'center' | 'right'
}

export function DataTableColumnHeader({
  title,
  canSort = true,
  isSorted = false,
  onToggle,
  align = 'left',
  className,
}: DataTableColumnHeaderProps) {
  if (!canSort) {
    return (
      <div
        className={cn(
          'text-xs font-medium text-muted-foreground',
          align === 'center' && 'text-center',
          align === 'right' && 'text-right',
          className
        )}
      >
        {title}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center space-x-1',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        className
      )}
    >
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onToggle}
        className={cn(
          'h-8 px-2 text-xs font-medium text-foreground hover:bg-muted/80 data-[state=open]:bg-accent',
          align === 'left' && '-ml-2'
        )}
      >
        <span>{title}</span>
        {isSorted === 'desc' ? (
          <ArrowDown className='ml-1.5 size-3.5 text-foreground' />
        ) : isSorted === 'asc' ? (
          <ArrowUp className='ml-1.5 size-3.5 text-foreground' />
        ) : (
          <ArrowUpDown className='ml-1.5 size-3.5 text-muted-foreground/60' />
        )}
      </Button>
    </div>
  )
}
