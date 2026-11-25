import {
  Folder,
  FolderTree,
  Globe,
  Compass,
  Code,
  Terminal,
  Cpu,
  Server,
  Sparkles,
  Bookmark,
  BookOpen,
  Layers,
  Settings,
  Shield,
  Star,
  Tag,
  Wrench,
  Boxes,
  FileCode,
  Hash,
  Palette,
  Search,
  Gamepad2,
  Smartphone,
  Lock,
  BarChart2,
  Zap,
  Cloud,
  Database,
  Music,
  Video,
  ShoppingBag,
  Heart,
  Smile,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LazyImage } from '@/components/LazyImage'

interface CategoryIconProps {
  icon?: string | null
  isRoot?: boolean
  className?: string
  size?: number
}

const ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  foldertree: FolderTree,
  globe: Globe,
  compass: Compass,
  code: Code,
  terminal: Terminal,
  cpu: Cpu,
  server: Server,
  sparkles: Sparkles,
  bookmark: Bookmark,
  bookopen: BookOpen,
  layers: Layers,
  settings: Settings,
  shield: Shield,
  star: Star,
  tag: Tag,
  wrench: Wrench,
  boxes: Boxes,
  filecode: FileCode,
  hash: Hash,
  palette: Palette,
  search: Search,
  gamepad: Gamepad2,
  gamepad2: Gamepad2,
  smartphone: Smartphone,
  mobile: Smartphone,
  lock: Lock,
  barchart: BarChart2,
  barchart2: BarChart2,
  chart: BarChart2,
  zap: Zap,
  cloud: Cloud,
  database: Database,
  db: Database,
  music: Music,
  video: Video,
  shoppingbag: ShoppingBag,
  shop: ShoppingBag,
  heart: Heart,
  smile: Smile,
}

function isEmoji(str: string): boolean {
  return /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)+$/u.test(str.trim())
}

function isImageUrl(str: string): boolean {
  return /^(https?:\/\/|\/|data:image\/)/.test(str.trim())
}

export function CategoryIcon({ icon, isRoot = false, className, size }: CategoryIconProps) {
  const trimmed = icon?.trim()

  if (trimmed) {
    // 1. External image or relative path (支持懒加载)
    if (isImageUrl(trimmed)) {
      return (
        <LazyImage
          src={trimmed}
          alt=''
          className={cn('rounded object-contain shrink-0', className)}
          style={size ? { width: size, height: size } : undefined}
          width={size}
          height={size}
          fallback={
            isRoot ? (
              <FolderTree className={cn('shrink-0', className)} style={size ? { width: size, height: size } : undefined} />
            ) : (
              <Folder className={cn('shrink-0', className)} style={size ? { width: size, height: size } : undefined} />
            )
          }
        />
      )
    }

    // 2. Unicode Emoji
    if (isEmoji(trimmed)) {
      return (
        <span
          className={cn('inline-flex items-center justify-center leading-none select-none shrink-0', className)}
          style={size ? { fontSize: size } : undefined}
        >
          {trimmed}
        </span>
      )
    }

    // 3. Lucide icon name
    const normalizedKey = trimmed.toLowerCase().replace(/[-_\s]/g, '')
    const LucideComponent = ICON_MAP[normalizedKey]
    if (LucideComponent) {
      return <LucideComponent className={cn('shrink-0', className)} style={size ? { width: size, height: size } : undefined} />
    }
  }

  // 4. Fallback default icon
  if (isRoot) {
    return <FolderTree className={cn('shrink-0', className)} style={size ? { width: size, height: size } : undefined} />
  }
  return <Folder className={cn('shrink-0', className)} style={size ? { width: size, height: size } : undefined} />
}
