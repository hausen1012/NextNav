import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bookmark,
  FolderTree,
  AlertTriangle,
  Activity,
  Plus,
  ExternalLink,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react'
import { useHome, useInvalidateHome } from '@/lib/query'
import { api, type LinkDTO } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'
import { SiteIcon } from '@/components/SiteIcon'

export function AdminOverviewPage() {
  const { data: home, isLoading } = useHome()
  const invalidate = useInvalidateHome()

  // Quick link dialog
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quick category dialog
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [catName, setCatName] = useState('')
  const [catSubmitting, setCatSubmitting] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)

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
  const totalClicks = allLinks.reduce((acc, l) => acc + (l.clickCount || 0), 0)

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault()
    if (!categoryId && allCategories[0]) {
      setCategoryId(allCategories[0].id)
    }
    const targetCatId = categoryId || allCategories[0]?.id
    if (!targetCatId) {
      setError('请先创建分类')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await api.createLink({
        categoryId: targetCatId,
        title,
        url,
        description: description || null,
      })
      invalidate()
      setAddLinkOpen(false)
      setTitle('')
      setUrl('')
      setDescription('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建书签失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    setCatSubmitting(true)
    setCatError(null)
    try {
      await api.createCategory({ name: catName })
      invalidate()
      setAddCatOpen(false)
      setCatName('')
    } catch (err: unknown) {
      setCatError(err instanceof Error ? err.message : '创建分类失败')
    } finally {
      setCatSubmitting(false)
    }
  }

  return (
    <div className='space-y-6'>
      {/* Page Header */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>概览看板</h1>
          <p className='text-sm text-muted-foreground'>
            欢迎回到 NextNav 管理后台，监控站点数据与快捷管理导航内容。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            className='gap-1.5'
            onClick={() => {
              if (allCategories.length > 0) setCategoryId(allCategories[0].id)
              setAddLinkOpen(true)
            }}
          >
            <Plus className='size-4' />
            <span>新建书签</span>
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
            <CardTitle className='text-sm font-medium text-muted-foreground'>书签总数</CardTitle>
            <Bookmark className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{isLoading ? '...' : allLinks.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              累计点击量: {totalClicks} 次
            </p>
          </CardContent>
        </Card>

        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>分类分组</CardTitle>
            <FolderTree className='size-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{isLoading ? '...' : allCategories.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              主分组 {home?.groups?.length ?? 0} 个
            </p>
          </CardContent>
        </Card>

        <Card className='shadow-xs'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>健康告警</CardTitle>
            <AlertTriangle className='size-4 text-amber-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{isLoading ? '...' : deadOrWarnLinks.length}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              {deadOrWarnLinks.length === 0 ? '所有链接正常' : '需要关注状态'}
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
              单二进制 + SQLite 极速响应
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
              <CardTitle className='text-base'>最近书签</CardTitle>
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
                  暂无书签，点击右上角快速添加
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
            <CardDescription>快速前往各模块管理与运维</CardDescription>
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
                  <div className='text-xs text-muted-foreground'>调整分组树、层级与排序</div>
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
                  <Bookmark className='size-4' />
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

      {/* Add Link Dialog */}
      <Dialog open={addLinkOpen} onOpenChange={setAddLinkOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>新建书签</DialogTitle>
            <DialogDescription>快速向指定分类中添加新书签导航。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateLink} className='space-y-4 pt-2'>
            {error && <p className='text-xs text-destructive'>{error}</p>}
            <Field label='书签名称' htmlFor='link-title'>
              <Input
                id='link-title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='例如：GitHub'
                required
              />
            </Field>
            <Field label='网址 (URL)' htmlFor='link-url'>
              <Input
                id='link-url'
                type='url'
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder='https://github.com'
                required
              />
            </Field>
            <Field label='归属分类' htmlFor='link-cat'>
              <select
                id='link-cat'
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              >
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label='描述说明（可选）' htmlFor='link-desc'>
              <Input
                id='link-desc'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='简要功能介绍'
              />
            </Field>
            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setAddLinkOpen(false)}>
                取消
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? '保存中...' : '确认添加'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>新建分类</DialogTitle>
            <DialogDescription>创建新的主分类分组。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className='space-y-4 pt-2'>
            {catError && <p className='text-xs text-destructive'>{catError}</p>}
            <Field label='分类名称' htmlFor='cat-name'>
              <Input
                id='cat-name'
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder='例如：常用工具'
                required
              />
            </Field>
            <DialogFooter className='pt-2'>
              <Button type='button' variant='outline' onClick={() => setAddCatOpen(false)}>
                取消
              </Button>
              <Button type='submit' disabled={catSubmitting}>
                {catSubmitting ? '创建中...' : '确认创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
