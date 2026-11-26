import type { ReactNode } from 'react'
import { SquarePen, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useLongPress } from '@/hooks/useLongPress'

interface CategoryContextMenuProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  onEdit: () => void
  onDelete: () => void
}

export function CategoryContextMenu({
  children,
  className,
  onClick,
  onEdit,
  onDelete,
}: CategoryContextMenuProps) {
  const { consumeLongPress, ...longPressHandlers } = useLongPress(() => {}, 700, 0)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={className}
          onClick={() => {
            // 移动端长按已打开菜单，跳过跟进的点击跳转
            if (!consumeLongPress()) onClick?.()
          }}
          {...longPressHandlers}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className='w-36'>
        <ContextMenuItem onClick={onEdit}>
          <SquarePen className='mr-2 size-3.5 text-zinc-500' />
          <span>编辑分类</span>
        </ContextMenuItem>
        <ContextMenuItem variant='destructive' onClick={onDelete}>
          <Trash2 className='mr-2 size-3.5' />
          <span>删除分类</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
