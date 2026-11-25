import { useState, useEffect, useRef } from 'react'
import { isImageCached, preloadImage } from '@/lib/image-loader'

export type LazyImageStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface UseLazyImageOptions {
  src: string | null | undefined
  rootMargin?: string
  enabled?: boolean
}

export function useLazyImage({
  src,
  rootMargin = '80px',
  enabled = true,
}: UseLazyImageOptions) {
  const isBlobOrData = Boolean(src?.startsWith('blob:') || src?.startsWith('data:'))

  const elementRef = useRef<HTMLDivElement | HTMLImageElement | null>(null)
  const [status, setStatus] = useState<LazyImageStatus>(() => {
    if (!src || !enabled) return 'idle'
    if (isBlobOrData || isImageCached(src)) return 'loaded'
    return 'idle'
  })

  useEffect(() => {
    if (!src || !enabled) {
      setStatus('idle')
      return
    }

    // 本地 blob 或 data URL，或者已在内存缓存中，直接展示，无需重复进入 loading
    if (isBlobOrData || isImageCached(src)) {
      setStatus('loaded')
      return
    }

    setStatus('idle')

    // 环境降级：若不支持 IntersectionObserver，立即触发加载
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setStatus('loading')
      let cancelled = false
      preloadImage(src)
        .then(() => {
          if (!cancelled) setStatus('loaded')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
      return () => {
        cancelled = true
      }
    }

    const node = elementRef.current
    if (!node) return

    let cancelled = false

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          // 已滑动到可视区域，解绑观察器并触发加载
          observer.disconnect()
          if (cancelled) return

          setStatus('loading')
          preloadImage(src)
            .then(() => {
              if (!cancelled) setStatus('loaded')
            })
            .catch(() => {
              if (!cancelled) setStatus('error')
            })
        }
      },
      { rootMargin }
    )

    observer.observe(node)

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [src, rootMargin, enabled])

  return { ref: elementRef, status }
}
