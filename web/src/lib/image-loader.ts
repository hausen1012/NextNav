// 内存中已成功加载的图片缓存集合，避免同会话重复加载闪烁
const loadedImageUrls = new Set<string>()

/**
 * 检查图片 URL 是否已在当前会话中成功加载过
 */
export function isImageCached(url: string | null | undefined): boolean {
  if (!url) return false
  return loadedImageUrls.has(url)
}

/**
 * 将图片标记为已缓存
 */
export function markImageCached(url: string): void {
  if (url) loadedImageUrls.add(url)
}

/**
 * 清除图片缓存（主要供测试使用）
 */
export function clearImageCache(): void {
  loadedImageUrls.clear()
}

/**
 * 异步预加载图片
 */
export function preloadImage(url: string): Promise<string> {
  if (!url) {
    return Promise.reject(new Error('Empty image URL'))
  }

  if (loadedImageUrls.has(url)) {
    return Promise.resolve(url)
  }

  return new Promise((resolve, reject) => {
    // 兼容非浏览器环境（如服务端或测试环境）
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      loadedImageUrls.add(url)
      resolve(url)
      return
    }

    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      loadedImageUrls.add(url)
      resolve(url)
    }
    img.onerror = (err) => {
      reject(err)
    }
    img.src = url
  })
}
