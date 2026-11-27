import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Link2,
  FolderTree,
  AlertTriangle,
  Activity,
  Plus,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react'
import { useAdminCategories, useAdminLinks, useInvalidateNavigationData } from '@/lib/query'
import type { LinkDTO } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SiteIcon } from '@/components/SiteIcon'
import { CategoryDialog } from '@/components/admin/CategoryDialog'
import { LinkDialog } from '@/components/LinkDialog'

export function AdminOverviewPage() {
  const { data: categoryData, isLoading: categoriesLoading } = useAdminCategories()
  const { data: linkData, isLoading: linksLoading } = useAdminLinks()
  const isLoading = categoriesLoading || linksLoading
  const invalidate = useInvalidateNavigationData()

  // Quick dialog states
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [addCatOpen, setAddCatOpen] = useState(false)

  // Flatten links and categories
  const allCategories: { id: number; name: string; isGroup: boolean }[] = []
  const allLinks: (LinkDTO & { categoryName?: string })[] = []

  for (const group of categoryData?.groups || []) {
    allCategories.push({ id: group.id, name: group.name, isGroup: true })
    for (const cat of group.categories) {
      allCategories.push({ id: cat.id, name: `${group.name} / ${cat.name}`, isGroup: false })
    }
  }
  for (const link of linkData?.items || []) {
    allLinks.push({ ...link, categoryName: link.categoryName })
  }

  const deadOrWarnLinks = allLinks.filter((l) => l.status === 'dead' || l.status === 'warn')
  const privateCount = allLinks.filter((l) => l.isPrivate).length
  const publicCount = allLinks.length - privateCount

  return (
    <div className='space-y-6'>
      {/* Page Header */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>概览看板</h1>
          <p className='text-sm text-muted-foreground'>
            站点运行指标与常用操作入口。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            className='gap-1.5'
            onClick={() => setAddLinkOpen(true)}
          >
            <Plus className='size-4' />
            <span>新建链接</span>
          </Button>
          <Button
            size='sm'
            className='gap-1.5'
            onClick={() => setAddCatOpen(true)}
          >
            <FolderTree className='size-4' />
            <span>新建分类</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>链接总数</CardTitle>
            <Link2 className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{isLoading ? '...' : allLinks.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              公开 {publicCount} 条 · 私有 {privateCount} 条
            </p>
          </CardContent>
        </Card>

        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>分类总数</CardTitle>
            <FolderTree className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{isLoading ? '...' : allCategories.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              一级分类 {categoryData?.groups.length ?? 0} 个
            </p>
          </CardContent>
        </Card>

        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>健康告警</CardTitle>
            <AlertTriangle className='size-4 text-amber-500' />
          </CardHeader>
          <CardContent>
            <div className='flex items-center justify-between'>
              <div className='text-2xl font-bold'>{isLoading ? '...' : deadOrWarnLinks.length}</div>
              {deadOrWarnLinks.length > 0 && (
                <Button variant='ghost' size='sm' className='h-6 px-1.5 text-xs text-amber-600 dark:text-amber-400 gap-0.5' asChild>
                  <Link to='/admin/links'>
                    <span>排查</span>
                    <ArrowUpRight className='size-3' />
                  </Link>
                </Button>
              )}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              {deadOrWarnLinks.length === 0 ? '所有链接正常' : '项链接异常或失效'}
            </p>
          </CardContent>
        </Card>

        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>站点状态</CardTitle>
            <Activity className='size-4 text-emerald-500' />
          </CardHeader>
          <CardContent>
            <div className='flex items-center gap-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400'>
              <span className='size-2.5 rounded-full bg-emerald-500 animate-pulse' />
              <span>运行中</span>
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              服务响应正常
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Links Table */}
      <Card className='gap-3 py-4 shadow-xs'>
        <CardHeader className='flex flex-row items-center justify-between pb-2'>
          <div>
            <CardTitle className='text-base'>最近链接</CardTitle>
            <CardDescription>当前站点收录的最新链接列表</CardDescription>
          </div>
          <Button variant='ghost' size='sm' className='gap-1 text-xs' asChild>
            <Link to='/admin/links'>
              <span>查看全部</span>
              <ArrowUpRight className='size-3.5' />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className='grid gap-2 md:grid-cols-2'>
            {allLinks.length === 0 ? (
              <div className='col-span-full py-6 text-center text-sm text-muted-foreground'>
                暂无链接，点击右上角快速添加
              </div>
            ) : (
              allLinks.slice(0, 6).map((link) => (
                <div
                  key={link.id}
                  className='flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 hover:bg-muted/40 transition-colors'
                >
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} size={32} />
                    <div className='min-w-0'>
                      <div className='flex items-center gap-1.5'>
                        <span className='truncate text-sm font-medium'>{link.title}</span>
                        {link.isPrivate && (
                          <Badge variant='outline' className='text-[10px] px-1 py-0'>
                            私有
                          </Badge>
                        )}
                      </div>
                      <p className='truncate text-xs text-muted-foreground'>{link.url}</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-2 shrink-0'>
                    {link.categoryName && (
                      <Badge variant='secondary' className='text-xs hidden sm:inline-flex'>
                        {link.categoryName}
                      </Badge>
                    )}
                    <Button variant='ghost' size='icon' className='size-6' asChild>
                      <a href={link.url} target='_blank' rel='noopener noreferrer'>
                        <ExternalLink className='size-3.5' />
                      </a>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shared Modals */}
      <LinkDialog
        open={addLinkOpen}
        onOpenChange={setAddLinkOpen}
        categories={allCategories}
        onSuccess={invalidate}
      />
      <CategoryDialog
        open={addCatOpen}
        onOpenChange={setAddCatOpen}
        rootGroups={allCategories.filter((c) => c.isGroup)}
        onSuccess={invalidate}
      />
    </div>
  )
}
