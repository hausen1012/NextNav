import { X } from 'lucide-react'
import { LoginForm } from '@/components/login-form'

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs overflow-y-auto'>
      <div className='w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150 my-8'>
        <div className='flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800'>
          <h3 className='text-base font-bold text-zinc-900 dark:text-zinc-100'>登录</h3>
          <button
            type='button'
            onClick={onClose}
            className='rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
            aria-label='关闭登录弹窗'
          >
            <X className='size-4' />
          </button>
        </div>
        <div className='mt-4'>
          <LoginForm onSuccess={onClose} />
        </div>
      </div>
    </div>
  )
}
