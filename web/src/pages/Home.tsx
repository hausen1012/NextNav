import { Link } from 'react-router-dom'
import { useHome } from '@/lib/query'
import type { CategoryDTO, GroupDTO, LinkDTO } from '@/lib/api'
import { SiteIcon } from '@/components/SiteIcon'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TriangleAlert } from 'lucide-react'

function StatusDot({ status }: { status: LinkDTO['status'] }) {
  if (status === 'dead') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-red-500' title='链接失效' />
  }
  if (status === 'warn') {
    return <span className='absolute right-2 top-2 size-2 rounded-full bg-amber-400' title='响应较慢' />
  }
  return null
}

function LinkCard({ link, newTab }: { link: LinkDTO; newTab: boolean }) {
  return (
    <a
      href={link.url}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className={cn(
        'group relative flex h-[62px] items-center gap-3 rounded-lg border bg-card p-3',
        'transition hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <StatusDot status={link.status} />
      <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium'>
          {link.title}
          {link.isPrivate ? (
            <Badge variant='secondary' className='ml-1.5 align-middle text-[10px]'>
              私有
            </Badge>
          ) : null}
        </span>
        {link.description ? (
          <span className='block truncate text-xs text-muted-foreground'>{link.description}</span>
        ) : null}
      </span>
    </a>
  )
}

function LinkGrid({ links, newTab }: { links: LinkDTO[]; newTab: boolean }) {
  return (
    <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
      {links.map((l) => (
        <LinkCard key={l.id} link={l} newTab={newTab} />
      ))}
    </div>
  )
}

function Section({ category, links, newTab }: { category: CategoryDTO; links: LinkDTO[]; newTab: boolean }) {
  return (
    <section className='space-y-2.5'>
      <div className='flex items-center gap-1.5'>
        <CategoryIcon icon={category.icon || category.iconUrl} isRoot={false} className='size-3.5 text-muted-foreground' />
        <h3 className='text-sm font-medium text-muted-foreground'>{category.name}</h3>
        {category.description ? (
          <span className='text-xs text-muted-foreground/75 truncate font-normal'>- {category.description}</span>
        ) : null}
      </div>
      <LinkGrid links={links} newTab={newTab} />
    </section>
  )
}

function CategoryBlock({ group, newTab }: { group: GroupDTO; newTab: boolean }) {
  const hasContent = group.links.length > 0 || group.categories.length > 0
  if (!hasContent) return null

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <div className='flex items-center gap-2'>
          <CategoryIcon icon={group.icon || group.iconUrl} isRoot={true} className='size-4 text-primary' />
          <h2 className='text-base font-semibold'>{group.name}</h2>
        </div>
        {group.description ? (
          <span className='text-xs text-muted-foreground'>{group.description}</span>
        ) : null}
      </div>
      {group.links.length > 0 ? <LinkGrid links={group.links} newTab={newTab} /> : null}
      {group.categories.map((c: CategoryDTO) =>
        c.links.length > 0 ? (
          <Section key={c.id} category={c} links={c.links} newTab={newTab} />
        ) : null,
      )}
    </section>
  )
}

function HomeSkeleton() {
  return (
    <div className='space-y-8'>
      {[0, 1, 2].map((g) => (
        <div key={g} className='space-y-4'>
          <Skeleton className='h-5 w-24' />
          <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-[58px] rounded-lg' />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HomePage() {
  const { data, isLoading, error } = useHome()

  if (isLoading) {
    return <HomeSkeleton />
  }
  if (error) {
    return (
      <Alert variant='destructive'>
        <TriangleAlert />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }
  if (!data) return null

  const isEmpty = data.groups.every(
    (g) => g.links.length === 0 && g.categories.every((c) => c.links.length === 0),
  )

  return (
    <div className='space-y-8'>
      {data.site.description ? (
        <p className='text-sm text-muted-foreground'>{data.site.description}</p>
      ) : null}

      {isEmpty ? (
        <div className='rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>暂无链接数据。</p>
          <Link to='/admin/links' className='mt-3 inline-block text-sm text-primary hover:underline'>
            前往后台添加链接
          </Link>
        </div>
      ) : (
        data.groups.map((g) => <CategoryBlock key={g.id} group={g} newTab={data.site.openInNewTab} />)
      )}
    </div>
  )
}