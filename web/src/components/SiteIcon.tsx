import { useState } from 'react'
import { hashHue, initialOf } from '../lib/utils'

type Props = {
  name: string
  url?: string
  iconUrl: string | null
  size?: number
  className?: string
}

// Icon with a deterministic letter fallback: no network request is required
// when a favicon is missing (docs/FEATURES.md A6).
export function SiteIcon({ name, url = '', iconUrl, size = 26, className = '' }: Props) {
  const [failed, setFailed] = useState(false)

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=''
        width={size}
        height={size}
        loading='lazy'
        decoding='async'
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-md object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const hue = hashHue(url || name)
  return (
    <span
      aria-hidden='true'
      className={`flex shrink-0 items-center justify-center rounded-lg font-semibold text-white select-none ${className}`}
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