import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useHome } from '@/lib/query'
import type { CategoryDTO, GroupDTO, LinkDTO } from '@/lib/api'
import { SiteIcon } from '@/components/SiteIcon'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, hostOf } from '@/lib/utils'
import { TriangleAlert, Search, X } from 'lucide-react'

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
      <div className='flex justify-between items-center'>
        <Skeleton className='h-4 w-48' />
        <Skeleton className='h-9 w-64 rounded-md' />
      </div>
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
  const [keyword, setKeyword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInputActive = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && !isInputActive) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setKeyword('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const { filteredGroups, totalMatched } = useMemo(() => {
    if (!data?.groups) return { filteredGroups: [], totalMatched: 0 }
    const q = keyword.trim().toLowerCase()
    if (!q) {
      const count = data.groups.reduce((acc, g) => {
        return acc + g.links.length + g.categories.reduce((cAcc, c) => cAcc + c.links.length, 0)
      }, 0)
      return { filteredGroups: data.groups, totalMatched: count }
    }

    let matchCount = 0
    const groups: GroupDTO[] = []

    for (const group of data.groups) {
      const groupNameMatch = group.name.toLowerCase().includes(q)

      const matchedDirectLinks = group.links.filter((l) => {
        return (
          groupNameMatch ||
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          hostOf(l.url).toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q))
        )
      })

      const matchedCategories: CategoryDTO[] = []
      for (const cat of group.categories) {
        const catNameMatch = groupNameMatch || cat.name.toLowerCase().includes(q)
        const matchedCatLinks = cat.links.filter((l) => {
          return (
            catNameMatch ||
            l.title.toLowerCase().includes(q) ||
            l.url.toLowerCase().includes(q) ||
            hostOf(l.url).toLowerCase().includes(q) ||
            (l.description && l.description.toLowerCase().includes(q))
          )
        })
        if (matchedCatLinks.length > 0) {
          matchCount += matchedCatLinks.length
          matchedCategories.push({
            ...cat,
            links: matchedCatLinks,
          })
        }
      }

      matchCount += matchedDirectLinks.length
      if (matchedDirectLinks.length > 0 || matchedCategories.length > 0) {
        groups.push({
          ...group,
          links: matchedDirectLinks,
          categories: matchedCategories,
        })
      }
    }

    return { filteredGroups: groups, totalMatched: matchCount }
  }, [data?.groups, keyword])

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

  const isInitialEmpty = data.groups.every(
    (g) => g.links.length === 0 && g.categories.every((c) => c.links.length === 0),
  )

  return (
    <div className='space-y-6'>
      {/* Search Header Bar */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          {data.site.description ? (
            <p className='text-sm text-muted-foreground'>{data.site.description}</p>
          ) : null}
        </div>
        {!isInitialEmpty ? (
          <div className='relative w-full sm:w-72 md:w-80'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              ref={inputRef}
              type='search'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder='极速搜索链接或分类...'
              className='h-9 bg-card/60 pl-8 pr-14 backdrop-blur'
            />
            {keyword ? (
              <button
                type='button'
                onClick={() => {
                  setKeyword('')
                  inputRef.current?.focus()
                }}
                className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground'
                title='清空搜索'
                aria-label='清空搜索'
              >
                <X className='size-3.5' />
              </button>
            ) : (
              <kbd className='pointer-events-none absolute right-2.5 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex'>
                /
              </kbd>
            )}
          </div>
        ) : null}
      </div>

      {isInitialEmpty ? (
        <div className='rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>暂无链接数据。</p>
          <Link to='/admin/links' className='mt-3 inline-block text-sm text-primary hover:underline'>
            前往后台添加链接
          </Link>
        </div>
      ) : keyword.trim() && totalMatched === 0 ? (
        <div className='rounded-lg border border-dashed p-10 text-center'>
          <p className='text-sm text-muted-foreground'>未找到与 “{keyword}” 相关的链接。</p>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setKeyword('')
              inputRef.current?.focus()
            }}
            className='mt-3 text-sm text-primary hover:underline'
          >
            清空搜索
          </Button>
        </div>
      ) : (
        <>
          {keyword.trim() ? (
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>找到 {totalMatched} 个相关链接</span>
              <button
                type='button'
                onClick={() => setKeyword('')}
                className='hover:text-foreground hover:underline'
              >
                清除筛选
              </button>
            </div>
          ) : null}
          <div className='space-y-8'>
            {filteredGroups.map((g) => (
              <CategoryBlock key={g.id} group={g} newTab={data.site.openInNewTab} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}