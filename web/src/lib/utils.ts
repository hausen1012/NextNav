import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Deterministic hue in [0, 360) derived from a string. */
export function hashHue(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 360
  }
  return h
}

/** First character of a title, uppercased; `?` when empty. */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return Array.from(trimmed)[0].toUpperCase()
}

/** Host without a leading `www.`; falls back to the raw input. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** 提取 URL 的域名（如 www.amjun.com），忽略协议与路径 */
export function extractDomain(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  try {
    const fullUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`
    return new URL(fullUrl).hostname
  } catch {
    return ''
  }
}

/** 根据全局 Favicon 服务模板与目标网页 URL 生成最终图标地址 */
export function formatFaviconUrl(template?: string | null, rawUrl?: string | null): string | null {
  if (!template || !rawUrl) return null
  const tmpl = template.trim()
  const domain = extractDomain(rawUrl)
  if (!tmpl || !domain) return null

  if (tmpl.includes('{domain}')) {
    return tmpl.replace('{domain}', domain)
  }
  if (tmpl.endsWith('/')) {
    return `${tmpl}${domain}`
  }
  return `${tmpl}/${domain}`
}