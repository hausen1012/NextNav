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