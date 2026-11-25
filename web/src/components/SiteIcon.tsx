import { useLazyImage } from '@/hooks/useLazyImage'
import { hashHue, initialOf } from '@/lib/utils'

type Props = {
  name: string
  url?: string
  iconUrl: string | null
  size?: number
  className?: string
}

export function SiteIcon({ name, url = '', iconUrl, size = 40, className = '' }: Props) {
  const { ref, status } = useLazyImage({ src: iconUrl })

  // 1. 如果已加载成功，展示目标图标
  if (iconUrl && status === 'loaded') {
    return (
      <img
        src={iconUrl}
        alt=''
        width={size}
        height={size}
        decoding='async'
        className={`shrink-0 rounded-full object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  // 2. 如果滑动到可视区且正在下载，展示 loading 图片
  if (iconUrl && status === 'loading') {
    const loadingIconSize = Math.max(16, Math.round(size * 0.6))
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-100/80 dark:bg-zinc-800/50 ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src='/loading.svg'
          alt=''
          width={loadingIconSize}
          height={loadingIconSize}
          className='object-contain select-none pointer-events-none'
          style={{ width: loadingIconSize, height: loadingIconSize }}
        />
      </div>
    )
  }

  // 3. 如果尚未滑动到可视区，保持轻量占位，绝不发送网络请求
  if (iconUrl && status === 'idle') {
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        aria-hidden='true'
        className={`shrink-0 rounded-full bg-zinc-100/80 dark:bg-zinc-800/50 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  // 4. 无图标或加载失败 (status === 'error')，展示基于名称确定的彩色文字头像
  const hue = hashHue(url || name)
  return (
    <span
      aria-hidden='true'
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        backgroundColor: `hsl(${hue} 55% 45%)`,
      }}
    >
      {initialOf(name)}
    </span>
  )
}
