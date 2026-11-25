import { useLazyImage } from '@/hooks/useLazyImage'
import { cn } from '@/lib/utils'

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt?: string
  loadingSrc?: string
  fallback?: React.ReactNode
  containerClassName?: string
}

export function LazyImage({
  src,
  alt = '',
  loadingSrc = '/loading.svg',
  fallback,
  className,
  containerClassName,
  style,
  width,
  height,
  ...props
}: LazyImageProps) {
  const { ref, status } = useLazyImage({ src })

  if (status === 'error') {
    return fallback ? <>{fallback}</> : null
  }

  if (status === 'loaded') {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        decoding='async'
        referrerPolicy='no-referrer'
        className={className}
        style={style}
        {...props}
      />
    )
  }

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-zinc-100/80 dark:bg-zinc-800/50',
        containerClassName,
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
    >
      {status === 'loading' && (
        <img
          src={loadingSrc}
          alt=''
          className='size-3/5 object-contain select-none pointer-events-none'
        />
      )}
    </div>
  )
}
