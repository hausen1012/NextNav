import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Label + control + hint/error, matching the shadcn look. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className='space-y-1.5'>
      <label htmlFor={htmlFor} className='text-sm font-medium leading-none'>
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