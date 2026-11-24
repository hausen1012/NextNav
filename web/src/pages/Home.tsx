import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useHome, useMe, useInvalidateHome, clearHomeCache } from '@/lib/query'
import { api, type CategoryDTO, type GroupDTO, type LinkDTO } from '@/lib/api'
import { LinkCard } from '@/components/LinkCard'
import { CategoryIcon } from '@/components/CategoryIcon'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { hostOf } from '@/lib/utils'
import {
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  RotateCw,
  Settings,
  Plus,
  ArrowUp,
  LogOut,
  Menu,
  SquarePen,
  Download,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react'

// 常用搜索引擎配置
const SEARCH_ENGINES = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
  { id: 'google', name: '谷歌', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
  { id: 'local', name: '站内', url: '' },
]

export function HomePage() {
  const { data, isLoading, error } = useHome()
  const { data: me } = useMe()
  const invalidate = useInvalidateHome()

  // 搜索相关状态
  const [keyword, setKeyword] = useState('')
  const [engineIndex, setEngineIndex] = useState(0)
  const [showEngineDropdown, setShowEngineDropdown] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const engineDropdownRef = useRef<HTMLDivElement>(null)

  // 侧边栏与导航分类状态
  const [activeId, setActiveId] = useState<string>('')
  const [openGroupIds, setOpenGroupIds] = useState<Record<number, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 主题与交互状态
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [refreshing, setRefreshing] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // 二维码弹窗
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; title: string }>({
    open: false,
    url: '',
    title: '',
  })
  const [qrCopied, setQrCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // 删除确认弹窗
  const [deletingLink, setDeletingLink] = useState<LinkDTO | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 默认展开所有带有子分类的分组
  useEffect(() => {
    if (data?.groups) {
      const initialMap: Record<number, boolean> = {}
      data.groups.forEach((g) => {
        if (g.categories && g.categories.length > 0) {
          initialMap[g.id] = true
        }
      })
      setOpenGroupIds((prev) => ({ ...initialMap, ...prev }))
    }
  }, [data?.groups])

  // 快捷键支持：按 '/' 或 'F1' 快速聚焦搜索框
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInputActive = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      if ((e.key === 'F1' || e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && !isInputActive) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setKeyword('')
        searchInputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 监听右侧滚动以显示“回到顶部”按钮与自动高亮当前分类
  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300)

      if (keyword.trim()) return

      // 计算当前视口中可见的分类区域
      const sections = document.querySelectorAll<HTMLElement>('[data-nav-section]')
      let currentActive = ''
      const scrollPos = window.scrollY + 140

      sections.forEach((sec) => {
        const top = sec.offsetTop
        const height = sec.offsetHeight
        if (scrollPos >= top && scrollPos < top + height) {
          currentActive = sec.id
        }
      })

      if (currentActive) {
        setActiveId(currentActive)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [keyword])

  // 点击外部关闭搜索引擎选择框
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (engineDropdownRef.current && !engineDropdownRef.current.contains(e.target as Node)) {
        setShowEngineDropdown(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 二维码绘制
  useEffect(() => {
    if (!qrModal.open || !qrCanvasRef.current || !qrModal.url) return
    QRCode.toCanvas(
      qrCanvasRef.current,
      qrModal.url,
      {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      },
      (err) => {
        if (err) console.error('QR code generation error:', err)
      },
    )
  }, [qrModal.open, qrModal.url])

  // 站内链接过滤搜索
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

  // 平滑定位到目标分类锚点
  const scrollToCategory = (targetId: string) => {
    setActiveId(targetId)
    setSidebarOpen(false)
    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // 执行搜索
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = keyword.trim()
    const currentEngine = SEARCH_ENGINES[engineIndex]

    if (currentEngine.id !== 'local' && trimmed) {
      window.open(currentEngine.url + encodeURIComponent(trimmed), '_blank')
    } else {
      searchInputRef.current?.focus()
    }
  }

  // 刷新缓存数据
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await clearHomeCache()
      await invalidate()
    } finally {
      setRefreshing(false)
    }
  }

  // 切换折叠分组
  const toggleGroup = (groupId: number) => {
    setOpenGroupIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  // 执行删除链接
  const handleDeleteLink = async () => {
    if (!deletingLink) return
    setIsDeleting(true)
    try {
      await api.deleteLink(deletingLink.id)
      invalidate()
      setDeletingLink(null)
    } catch (err) {
      console.error('Delete link failed', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // 二维码弹窗下载与复制
  const handleDownloadQR = () => {
    if (!qrCanvasRef.current) return
    const a = document.createElement('a')
    a.href = qrCanvasRef.current.toDataURL('image/png')
    a.download = `${qrModal.title || 'qrcode'}.png`
    a.click()
  }

  const handleCopyQRLink = async () => {
    try {
      await navigator.clipboard.writeText(qrModal.url)
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#f3f5f8] dark:bg-[#0f1115]'>
        <div className='flex flex-col items-center gap-3 text-slate-400'>
          <RotateCw className='size-8 animate-spin text-blue-500' />
          <p className='text-sm font-medium'>正在加载导航数据...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#f3f5f8] dark:bg-[#0f1115] p-4'>
        <div className='max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-950 dark:bg-neutral-900'>
          <div className='flex items-center gap-3 text-red-500'>
            <AlertTriangle className='size-6' />
            <h2 className='text-base font-semibold'>加载失败</h2>
          </div>
          <p className='mt-2 text-sm text-slate-500 dark:text-neutral-400'>{error.message}</p>
          <button
            type='button'
            onClick={() => window.location.reload()}
            className='mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700'
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const isInitialEmpty = data.groups.every(
    (g) => g.links.length === 0 && g.categories.every((c) => c.links.length === 0),
  )

  return (
    <div
      className='min-h-screen bg-[#f3f5f8] dark:bg-[#0f1115] text-slate-800 dark:text-slate-100 transition-colors duration-200 font-sans'
      style={{ background: data.site.background || undefined }}
    >
      {/* 移动端侧边栏抽屉遮罩 */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===================== 左侧边栏 (Sidebar) ===================== */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-60 flex-col border-r border-slate-200/80 bg-[#f8f9fb] transition-transform duration-300 ease-in-out dark:border-neutral-800/80 dark:bg-[#16181d] md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* 顶部 Logo 与站点名称 */}
        <div className='flex h-16 items-center gap-3 px-5 border-b border-slate-200/60 dark:border-neutral-800/60'>
          {data.site.logoUrl ? (
            <img
              src={data.site.logoUrl}
              alt={data.site.name}
              className='size-8 object-contain rounded-md'
            />
          ) : (
            <div className='flex size-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-sm'>
              {data.site.name ? data.site.name.charAt(0).toUpperCase() : 'N'}
            </div>
          )}
          <button
            type='button'
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className='truncate text-left text-base font-bold text-slate-800 transition hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400'
          >
            {data.site.name || 'NextNav'}
          </button>
        </div>

        {/* 分类导航树形列表 */}
        <nav className='flex-1 overflow-y-auto px-3 py-4 space-y-1 select-none scrollbar-thin'>
          {data.groups.map((group) => {
            const hasSub = group.categories && group.categories.length > 0
            const isGroupOpen = !!openGroupIds[group.id]
            const isGroupActive = activeId === `group-${group.id}`

            return (
              <div key={group.id} className='space-y-0.5'>
                {/* 一级分类项 */}
                <div
                  className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition cursor-pointer ${
                    isGroupActive
                      ? 'bg-blue-50/90 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-neutral-300 dark:hover:bg-neutral-800/60 dark:hover:text-white'
                  }`}
                  onClick={() => scrollToCategory(`group-${group.id}`)}
                >
                  <div className='flex items-center gap-2.5 truncate'>
                    <CategoryIcon
                      icon={group.icon || group.iconUrl}
                      isRoot={true}
                      className={`size-4 shrink-0 ${isGroupActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-neutral-400 dark:group-hover:text-neutral-200'}`}
                    />
                    <span className='truncate'>{group.name}</span>
                  </div>

                  {/* 折叠/展开箭头 */}
                  {hasSub && (
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleGroup(group.id)
                      }}
                      className='rounded p-0.5 text-slate-400 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition'
                    >
                      {isGroupOpen ? (
                        <ChevronDown className='size-3.5' />
                      ) : (
                        <ChevronRight className='size-3.5' />
                      )}
                    </button>
                  )}
                </div>

                {/* 二级子分类列表 */}
                {hasSub && isGroupOpen && (
                  <div className='pl-6 space-y-0.5 pt-0.5'>
                    {group.categories.map((sub) => {
                      const isSubActive = activeId === `cat-${sub.id}`
                      return (
                        <div
                          key={sub.id}
                          onClick={() => scrollToCategory(`cat-${sub.id}`)}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                            isSubActive
                              ? 'bg-blue-50/80 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 font-medium'
                              : 'text-slate-500 hover:bg-slate-200/40 hover:text-slate-800 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                          }`}
                        >
                          <CategoryIcon
                            icon={sub.icon || sub.iconUrl}
                            isRoot={false}
                            className='size-3 shrink-0 text-slate-400'
                          />
                          <span className='truncate'>{sub.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* 侧边栏底部：快捷提示 */}
        <div className='p-4 border-t border-slate-200/60 dark:border-neutral-800/60 flex items-center justify-between'>
          <button
            type='button'
            onClick={() => {
              searchInputRef.current?.focus()
              searchInputRef.current?.select()
            }}
            className='inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 shadow-2xs hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
            title='快捷键 F1 快速搜索'
          >
            <span className='font-mono'>F1</span>
            <span className='text-[10px] font-normal text-slate-400 dark:text-neutral-500'>搜索</span>
          </button>
          <span className='text-[11px] text-slate-400 dark:text-neutral-500'>
            {totalMatched} 个链接
          </span>
        </div>
      </aside>

      {/* ===================== 右侧主内容区 (Main Content) ===================== */}
      <main className='min-h-screen flex flex-col md:ml-60 transition-all'>
        {/* 移动端顶栏 (仅在屏幕小于 md 时显示) */}
        <div className='sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-neutral-800/80 dark:bg-[#16181d]/90 md:hidden'>
          <button
            type='button'
            onClick={() => setSidebarOpen(true)}
            className='rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
            aria-label='打开分类侧边栏'
          >
            <Menu className='size-5' />
          </button>
          <span className='font-bold text-slate-800 dark:text-slate-100'>
            {data.site.name || 'NextNav'}
          </span>
          <div className='w-8' />
        </div>

        {/* 顶部搜索区 (OneNav 经典胶囊搜索框) */}
        <div className='pt-8 pb-4 px-4 sm:px-8 max-w-4xl mx-auto w-full'>
          <form onSubmit={handleSearchSubmit} className='relative w-full'>
            <div className='relative flex items-center rounded-full border border-slate-200 bg-white shadow-xs transition-all focus-within:border-blue-400 focus-within:shadow-md dark:border-neutral-700 dark:bg-[#1a1d24]'>
              {/* 搜索引擎下拉选择 */}
              <div ref={engineDropdownRef} className='relative shrink-0'>
                <button
                  type='button'
                  onClick={() => setShowEngineDropdown(!showEngineDropdown)}
                  className='flex items-center gap-1 pl-4 pr-3 py-3 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-neutral-300 dark:hover:text-white transition'
                >
                  <span>{SEARCH_ENGINES[engineIndex].name}</span>
                  <ChevronDown className='size-3 text-slate-400' />
                </button>

                {showEngineDropdown && (
                  <div className='absolute left-2 top-full mt-1.5 z-40 w-28 rounded-xl border border-slate-100 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-[#1f232b] text-xs'>
                    {SEARCH_ENGINES.map((eng, idx) => (
                      <button
                        key={eng.id}
                        type='button'
                        onClick={() => {
                          setEngineIndex(idx)
                          setShowEngineDropdown(false)
                          searchInputRef.current?.focus()
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                          engineIndex === idx
                            ? 'bg-blue-50 text-blue-600 font-medium dark:bg-blue-950/40 dark:text-blue-400'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span>{eng.name}</span>
                        {engineIndex === idx && <Check className='size-3' />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 垂直分割线 */}
              <div className='h-4 w-px bg-slate-200 dark:bg-neutral-700' />

              {/* 搜索输入框 */}
              <input
                ref={searchInputRef}
                type='search'
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='请输入关键词检索或外部搜索...'
                className='w-full bg-transparent px-3 py-3 text-sm text-slate-800 placeholder-slate-400 outline-hidden dark:text-slate-100 dark:placeholder-neutral-500'
              />

              {/* 清除按钮 */}
              {keyword && (
                <button
                  type='button'
                  onClick={() => {
                    setKeyword('')
                    searchInputRef.current?.focus()
                  }}
                  className='p-1 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200'
                  title='清空输入'
                >
                  <X className='size-4' />
                </button>
              )}

              {/* 搜索按钮 */}
              <button
                type='submit'
                className='mr-1.5 flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition'
                title='搜索'
              >
                <Search className='size-4' />
              </button>
            </div>
          </form>

          {/* 搜索提示或匹配统计 */}
          {keyword.trim() && (
            <div className='mt-2.5 flex items-center justify-between px-2 text-xs text-slate-400 dark:text-neutral-500'>
              <span>站内匹配到 {totalMatched} 个链接</span>
              <button
                type='button'
                onClick={() => setKeyword('')}
                className='text-blue-600 hover:underline dark:text-blue-400'
              >
                清除检索
              </button>
            </div>
          )}
        </div>

        {/* 链接分类主展示区 */}
        <div className='flex-1 px-4 sm:px-8 pb-20 space-y-10'>
          {isInitialEmpty ? (
            <div className='rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-neutral-800'>
              <p className='text-sm text-slate-500 dark:text-neutral-400'>暂无导航链接数据。</p>
              <Link
                to='/admin/links'
                className='mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700'
              >
                前往后台添加链接
              </Link>
            </div>
          ) : keyword.trim() && totalMatched === 0 ? (
            <div className='rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-neutral-800'>
              <p className='text-sm text-slate-500 dark:text-neutral-400'>
                未找到与 “{keyword}” 相关的站内链接。
              </p>
              <button
                type='button'
                onClick={() => {
                  setKeyword('')
                  searchInputRef.current?.focus()
                }}
                className='mt-3 text-xs text-blue-600 hover:underline dark:text-blue-400'
              >
                清空关键词
              </button>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const hasGroupContent =
                group.links.length > 0 ||
                group.categories.some((c) => c.links.length > 0)

              if (!hasGroupContent) return null

              return (
                <div
                  key={group.id}
                  id={`group-${group.id}`}
                  data-nav-section
                  className='scroll-mt-6 space-y-6'
                >
                  {/* 一级分类标题行 */}
                  <div className='flex items-center justify-between pt-2'>
                    <div className='flex items-baseline gap-2.5'>
                      <div className='flex items-center gap-2'>
                        <CategoryIcon
                          icon={group.icon || group.iconUrl}
                          isRoot={true}
                          className='size-4 text-blue-600 dark:text-blue-400'
                        />
                        <h2 className='text-lg font-bold text-slate-800 dark:text-slate-100'>
                          {group.name}
                        </h2>
                      </div>
                      {group.description && (
                        <span className='text-xs text-slate-400 dark:text-neutral-500 font-normal'>
                          {group.description}
                        </span>
                      )}
                    </div>

                    {/* 管理员快捷操作图标 (类似截图右侧的浅色小图标) */}
                    {me?.auth === 'admin' && (
                      <Link
                        to='/admin/categories'
                        className='flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-2xs hover:border-blue-300 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-blue-400 transition'
                        title='管理此分类'
                      >
                        <SquarePen className='size-3.5' />
                      </Link>
                    )}
                  </div>

                  {/* 一级分类直属链接网格 */}
                  {group.links.length > 0 && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5'>
                      {group.links.map((link) => (
                        <LinkCard
                          key={link.id}
                          link={link}
                          newTab={data.site.openInNewTab}
                          isAdmin={me?.auth === 'admin'}
                          onShowQR={(url, title) => setQrModal({ open: true, url, title })}
                          onDelete={(l) => setDeletingLink(l)}
                        />
                      ))}
                    </div>
                  )}

                  {/* 二级子分类区块 */}
                  {group.categories.map((sub) => {
                    if (sub.links.length === 0) return null
                    return (
                      <div
                        key={sub.id}
                        id={`cat-${sub.id}`}
                        data-nav-section
                        className='scroll-mt-6 space-y-3 pt-2'
                      >
                        {/* 二级子分类标题行 */}
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2'>
                            <CategoryIcon
                              icon={sub.icon || sub.iconUrl}
                              isRoot={false}
                              className='size-3.5 text-slate-400 dark:text-neutral-400'
                            />
                            <h3 className='text-sm font-semibold text-slate-700 dark:text-neutral-200'>
                              {sub.name}
                            </h3>
                            {sub.description && (
                              <span className='text-xs text-slate-400 dark:text-neutral-500 font-normal'>
                                - {sub.description}
                              </span>
                            )}
                          </div>

                          {me?.auth === 'admin' && (
                            <Link
                              to='/admin/categories'
                              className='flex size-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-800 transition'
                              title='管理分类'
                            >
                              <SquarePen className='size-3' />
                            </Link>
                          )}
                        </div>

                        {/* 二级子分类链接卡片网格 */}
                        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5'>
                          {sub.links.map((link) => (
                            <LinkCard
                              key={link.id}
                              link={link}
                              newTab={data.site.openInNewTab}
                              isAdmin={me?.auth === 'admin'}
                              onShowQR={(url, title) => setQrModal({ open: true, url, title })}
                              onDelete={(l) => setDeletingLink(l)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* ===================== 右下角悬浮工具条 (Floating Action Buttons) ===================== */}
      <div className='fixed right-6 bottom-6 z-40 flex flex-col items-center gap-2 select-none'>
        <div className='flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-neutral-800 dark:bg-[#1a1d24]/95'>
          {/* 添加链接快捷入口 */}
          {me?.auth === 'admin' && (
            <Link
              to='/admin/links'
              className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition'
              title='前往添加链接'
            >
              <Plus className='size-4' />
            </Link>
          )}

          {/* 深浅主题切换 */}
          <button
            type='button'
            onClick={() => {
              toggleTheme()
              setThemeState(getTheme())
            }}
            className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition'
            title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
            aria-label='切换深浅主题'
          >
            {theme === 'dark' ? <Sun className='size-4' /> : <Moon className='size-4' />}
          </button>

          {/* 刷新数据 */}
          <button
            type='button'
            onClick={handleRefresh}
            disabled={refreshing}
            className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition disabled:opacity-50'
            title='刷新导航数据'
            aria-label='刷新导航数据'
          >
            <RotateCw className={`size-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* 后台管理入口 */}
          {me?.auth === 'admin' ? (
            <Link
              to='/admin'
              className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition'
              title='进入管理后台'
            >
              <Settings className='size-4' />
            </Link>
          ) : (
            <Link
              to='/login'
              className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-blue-400 transition'
              title='登录'
            >
              <Settings className='size-4' />
            </Link>
          )}

          {/* 退出登录 (仅管理员) */}
          {me?.auth === 'admin' && (
            <button
              type='button'
              onClick={async () => {
                await api.logout()
                await clearHomeCache()
                window.location.reload()
              }}
              className='flex size-9 items-center justify-center rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 dark:text-neutral-300 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition'
              title='退出登录'
            >
              <LogOut className='size-4' />
            </button>
          )}
        </div>

        {/* 回到顶部按钮 */}
        {showScrollTop && (
          <button
            type='button'
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className='flex size-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-600 shadow-md backdrop-blur-md hover:bg-blue-600 hover:text-white dark:border-neutral-800 dark:bg-[#1a1d24]/95 dark:text-neutral-300 dark:hover:bg-blue-600 dark:hover:text-white transition'
            title='回到顶部'
          >
            <ArrowUp className='size-4' />
          </button>
        )}
      </div>

      {/* ===================== 原生轻量二维码 Modal (不依赖 shadcn) ===================== */}
      {qrModal.open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs'>
          <div className='w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-[#1a1d24] text-center animate-in fade-in zoom-in-95 duration-150'>
            <div className='flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800'>
              <h3 className='text-sm font-semibold truncate text-slate-800 dark:text-slate-100'>
                {qrModal.title || '链接二维码'}
              </h3>
              <button
                type='button'
                onClick={() => setQrModal((prev) => ({ ...prev, open: false }))}
                className='rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200'
              >
                <X className='size-4' />
              </button>
            </div>

            <div className='flex flex-col items-center justify-center py-4'>
              <div className='rounded-xl border border-slate-100 bg-white p-2.5 shadow-inner'>
                <canvas ref={qrCanvasRef} className='block' />
              </div>
              <p className='mt-3 max-w-full truncate px-2 text-xs text-slate-400 dark:text-neutral-500' title={qrModal.url}>
                {qrModal.url}
              </p>
            </div>

            <div className='grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800'>
              <button
                type='button'
                onClick={handleCopyQRLink}
                className='flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition'
              >
                {qrCopied ? <Check className='size-3.5 text-green-500' /> : <Copy className='size-3.5' />}
                <span>{qrCopied ? '已复制' : '复制链接'}</span>
              </button>
              <button
                type='button'
                onClick={handleDownloadQR}
                className='flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 transition'
              >
                <Download className='size-3.5' />
                <span>下载 PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 原生轻量删除确认 Modal (不依赖 shadcn) ===================== */}
      {deletingLink && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs'>
          <div className='w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150'>
            <h3 className='text-base font-semibold text-slate-800 dark:text-slate-100'>
              确认删除链接
            </h3>
            <p className='mt-2 text-xs text-slate-500 dark:text-neutral-400'>
              是否确定删除 “{deletingLink.title}”？此操作不可撤销。
            </p>
            <div className='mt-5 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setDeletingLink(null)}
                disabled={isDeleting}
                className='rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'
              >
                取消
              </button>
              <button
                type='button'
                onClick={handleDeleteLink}
                disabled={isDeleting}
                className='rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
              >
                {isDeleting ? '正在删除...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
