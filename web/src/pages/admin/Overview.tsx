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
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'
import { useHome, useInvalidateHome } from '@/lib/query'
import type { LinkDTO } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SiteIcon } from '@/components/SiteIcon'
import { CategoryDialog } from '@/components/admin/CategoryDialog'
import { LinkDialog } from '@/components/admin/LinkDialog'

export function AdminOverviewPage() {
  const { data: home, isLoading } = useHome()
  const invalidate = useInvalidateHome()

  // Quick dialog states
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [addCatOpen, setAddCatOpen] = useState(false)

  // Flatten links and categories
  const allCategories: { id: number; name: string; isGroup: boolean }[] = []
  const allLinks: (LinkDTO & { categoryName?: string })[] = []

  if (home?.groups) {
    for (const group of home.groups) {
      allCategories.push({ id: group.id, name: group.name, isGroup: true })
      for (const link of group.links) {
        allLinks.push({ ...link, categoryName: group.name })
      }
      for (const cat of group.categories) {
        allCategories.push({ id: cat.id, name: `${group.name} / ${cat.name}`, isGroup: false })
        for (const link of cat.links) {
          allLinks.push({ ...link, categoryName: cat.name })
        }
      }
    }
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
              一级分类 {home?.groups?.length ?? 0} 个
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

      {/* Quick shortcuts & Recent Links */}
      <div className='grid gap-6 md:grid-cols-7'>
        {/* Recent Links Table */}
        <Card className='md:col-span-4 shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-3'>
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
            <div className='space-y-3'>
              {allLinks.length === 0 ? (
                <div className='py-8 text-center text-sm text-muted-foreground'>
                  暂无链接，点击右上角快速添加
                </div>
              ) : (
                allLinks.slice(0, 6).map((link) => (
                  <div
                    key={link.id}
                    className='flex items-center justify-between gap-3 rounded-md border p-2.5 hover:bg-muted/40 transition-colors'
                  >
                    <div className='flex items-center gap-2.5 min-w-0'>
                      <SiteIcon name={link.title} url={link.url} iconUrl={link.iconUrl} />
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
                      <Button variant='ghost' size='icon' className='size-7' asChild>
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

        {/* Quick Operations and Tips */}
        <Card className='md:col-span-3 shadow-xs'>
          <CardHeader>
            <CardTitle className='text-base flex items-center gap-2'>
              <Sparkles className='size-4 text-primary' />
              <span>快捷入口</span>
            </CardTitle>
            <CardDescription>进入核心业务与系统维护</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2.5'>
            <Link
              to='/admin/categories'
              className='flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors'
            >
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-md bg-primary/10 text-primary'>
                  <FolderTree className='size-4' />
                </div>
                <div>
                  <div className='text-sm font-medium'>分类架构管理</div>
                  <div className='text-xs text-muted-foreground'>调整分类层级与排序</div>
                </div>
              </div>
              <ArrowUpRight className='size-4 text-muted-foreground' />
            </Link>

            <Link
              to='/admin/settings'
              className='flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors'
            >
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-md bg-primary/10 text-primary'>
                  <SlidersHorizontal className='size-4' />
                </div>
                <div>
                  <div className='text-sm font-medium'>站点基础设置</div>
                  <div className='text-xs text-muted-foreground'>修改站点名称、副标题及背景</div>
                </div>
              </div>
              <ArrowUpRight className='size-4 text-muted-foreground' />
            </Link>

            <Link
              to='/admin/system'
              className='flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors'
            >
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-md bg-destructive/10 text-destructive'>
                  <AlertTriangle className='size-4' />
                </div>
                <div>
                  <div className='text-sm font-medium'>示例数据清理</div>
                  <div className='text-xs text-muted-foreground'>一键删除初始化生成的示例链接</div>
                </div>
              </div>
              <ArrowUpRight className='size-4 text-muted-foreground' />
            </Link>
          </CardContent>
        </Card>
      </div>

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
