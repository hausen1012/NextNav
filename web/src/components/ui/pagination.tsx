import * as React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role='navigation'
      aria-label='pagination'
      data-slot='pagination'
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot='pagination-content'
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  )
}

function PaginationItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot='pagination-item' className={cn('', className)} {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<'button'>, 'className' | 'children' | 'onClick' | 'disabled'>

function PaginationLink({
  className,
  isActive,
  disabled,
  ...props
}: PaginationLinkProps) {
  return (
    <button
      type='button'
      aria-current={isActive ? 'page' : undefined}
      disabled={disabled}
      data-slot='pagination-link'
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? 'outline' : 'ghost',
          size: 'icon',
        }),
        'size-8 text-xs select-none disabled:opacity-40 disabled:pointer-events-none',
        isActive && 'border-primary/50 bg-accent font-semibold text-accent-foreground',
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  text = '上一页',
  disabled,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label='前往上一页'
      disabled={disabled}
      className={cn('w-auto gap-1 px-2.5', className)}
      {...props}
    >
      <ChevronLeft className='size-3.5' />
      <span>{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = '下一页',
  disabled,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label='前往下一页'
      disabled={disabled}
      className={cn('w-auto gap-1 px-2.5', className)}
      {...props}
    >
      <span>{text}</span>
      <ChevronRight className='size-3.5' />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot='pagination-ellipsis'
      className={cn('flex size-8 items-center justify-center text-muted-foreground', className)}
      {...props}
    >
      <MoreHorizontal className='size-4' />
      <span className='sr-only'>更多页面</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
