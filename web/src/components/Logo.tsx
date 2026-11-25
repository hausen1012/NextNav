import { cn } from '@/lib/utils'

interface LogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  className?: string
  src?: string | null
  alt?: string
}

export function Logo({ className, src, alt = 'NextNav', ...props }: LogoProps) {
  return (
    <img
      src={src || '/favicon.svg'}
      alt={alt}
      className={cn('size-8 shrink-0 object-contain', className)}
      {...props}
    />
  )
}
