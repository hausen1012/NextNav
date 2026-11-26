import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** 标签旁的问号提示，悬浮展示补充说明。 */
export function FieldHint({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label='字段说明'
          className='inline-flex shrink-0 text-muted-foreground transition hover:text-foreground'
        >
          <CircleHelp className='size-3.5' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='right'>{children}</TooltipContent>
    </Tooltip>
  )
}

/** Label + control + hint/error, matching the shadcn look. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: ReactNode
  hint?: string
  error?: string | null
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className='space-y-1.5'>
      <label htmlFor={htmlFor} className='flex items-center gap-1 text-sm font-medium leading-none'>
        {label}
      </label>
      {children}
      {error ? (
        <p className='text-xs text-destructive'>{error}</p>
      ) : hint ? (
        <p className='text-xs text-muted-foreground'>{hint}</p>
      ) : null}
    </div>
  )
}

/** Plain banner used for form-level success/error messages. */
export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return (
    <p className={cn('text-sm', kind === 'error' ? 'text-destructive' : 'text-emerald-600')}>
      {children}
    </p>
  )
}