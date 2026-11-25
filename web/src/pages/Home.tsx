import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useHome, useMe, useInvalidateHome, clearHomeCache } from '@/lib/query'
import { api, type CategoryDTO, type GroupDTO, type LinkDTO } from '@/lib/api'
import { LinkCard } from '@/components/LinkCard'
import { CategoryIcon } from '@/components/CategoryIcon'
import { SiteIcon } from '@/components/SiteIcon'
import { Logo } from '@/components/Logo'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { hostOf } from '@/lib/utils'
import {
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  RefreshCw,
  Settings,
  Plus,
  ArrowUp,
  User,
  LogOut,
  Menu,
  SquarePen,
  Download,
  Copy,
  Check,
  AlertTriangle,
  Sparkles,
  Trash2,
  ExternalLink,
  Upload,
} from 'lucide-react'

// 搜索引擎配置
const SEARCH_ENGINES = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
  { id: 'google', name: '谷歌', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
  { id: 'local', name: '站内', url: '' },
]

// 常用推荐图标
const COMMON_ICONS = ['folder', 'globe', 'compass', 'code', 'terminal', 'cpu', 'sparkles', 'wrench', 'music', 'server', 'star', 'tag']

export function HomePage() {
  const { data, isLoading, error } = useHome()
  const { data: me } = useMe()
  const invalidate = useInvalidateHome()
  const isAdmin = me?.auth === 'admin'

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

  // ==================== 模态弹窗状态 ====================
  // 1. 二维码弹窗
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; title: string }>({
    open: false,
    url: '',
    title: '',
  })
  const [qrCopied, setQrCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // 2. 链接删除确认弹窗
  const [deletingLink, setDeletingLink] = useState<LinkDTO | null>(null)
  const [isDeletingLink, setIsDeletingLink] = useState(false)

  // 3. 链接表单弹窗 (新建 / 编辑)
  const [linkModal, setLinkModal] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    id?: number
    title: string
    url: string
    backupUrl: string
    categoryId: number
    description: string
    iconPath: string
    iconUrl: string | null
    isPrivate: boolean
    sort: number
  }>({
    open: false,
    mode: 'create',
    title: '',
    url: '',
    backupUrl: '',
    categoryId: 0,
    description: '',
    iconPath: '',
    iconUrl: null,
    isPrivate: false,
    sort: 10,
  })
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [linkFetchingMeta, setLinkFetchingMeta] = useState(false)
  const [linkUploadingIcon, setLinkUploadingIcon] = useState(false)
  const [linkFormError, setLinkFormError] = useState<string | null>(null)
  const [linkIconFile, setLinkIconFile] = useState<File | null>(null)
  const linkIconInputRef = useRef<HTMLInputElement>(null)

  const handleAutoFetchMeta = async () => {
    const trimmed = linkModal.url.trim()
    if (!trimmed) return
    setLinkFetchingMeta(true)
    setLinkFormError(null)
    try {
      const meta = await api.fetchMeta(trimmed)
      setLinkModal((prev) => ({
        ...prev,
        title: prev.title || meta.title || '',
        description: prev.description || meta.description || '',
        url: meta.resolvedUrl || prev.url,
        iconPath: prev.iconPath || meta.iconPath || '',
        iconUrl: prev.iconUrl || meta.iconUrl || null,
      }))
    } catch {
      // 抓取失败不中断流程
    } finally {
      setLinkFetchingMeta(false)
    }
  }

  const handleLinkIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) {
      setLinkFormError('图标文件不能超过 1MB')
      return
    }
    setLinkFormError(null)
    if (linkModal.mode !== 'edit' || !linkModal.id) {
      setLinkIconFile(file)
      setLinkModal((prev) => ({
        ...prev,
        iconPath: '',
        iconUrl: URL.createObjectURL(file),
      }))
      return
    }
    setLinkUploadingIcon(true)
    try {
      const updated = await api.uploadLinkIcon(linkModal.id, file)
      setLinkModal((prev) => ({
        ...prev,
        iconPath: updated.iconPath || '',
        iconUrl: updated.iconUrl,
      }))
      await invalidate()
    } catch (err) {
      setLinkFormError(err instanceof Error ? err.message : '图标上传失败')
    } finally {
      setLinkUploadingIcon(false)
    }
  }

  const handleClearLinkIcon = async () => {
    setLinkIconFile(null)
    if (linkModal.mode !== 'edit' || !linkModal.id) {
      setLinkModal((prev) => ({ ...prev, iconPath: '', iconUrl: null }))
      return
    }
    setLinkUploadingIcon(true)
    try {
      await api.clearLinkIcon(linkModal.id)
      setLinkModal((prev) => ({ ...prev, iconPath: '', iconUrl: null }))
      await invalidate()
    } catch (err) {
      setLinkFormError(err instanceof Error ? err.message : '清除图标失败')
    } finally {
      setLinkUploadingIcon(false)
    }
  }

  // 4. 分类表单弹窗 (新建 / 编辑)
  const [categoryModal, setCategoryModal] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    id?: number
    name: string
    parentId: number | null
    icon: string
    description: string
    sort: number
    isPrivate: boolean
  }>({
    open: false,
    mode: 'create',
    name: '',
    parentId: null,
    icon: '',
    description: '',
    sort: 0,
    isPrivate: false,
  })
  const [categorySubmitting, setCategorySubmitting] = useState(false)
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null)

  // 5. 分类删除确认弹窗
  const [deletingCategory, setDeletingCategory] = useState<{ id: number; name: string } | null>(null)
  const [deleteCategoryMode, setDeleteCategoryMode] = useState<'delete' | 'move'>('delete')
  const [moveTargetCatId, setMoveTargetCatId] = useState<number | undefined>(undefined)
  const [isDeletingCat, setIsDeletingCat] = useState(false)

  // 6. 分类一键全部打开确认弹窗
  const [openAllConfirm, setOpenAllConfirm] = useState<{
    open: boolean
    categoryName: string
    links: LinkDTO[]
  } | null>(null)

  const handleOpenAll = (categoryName: string, links: LinkDTO[]) => {
    if (!links || links.length === 0) return
    setOpenAllConfirm({
      open: true,
      categoryName,
      links,
    })
  }

  const confirmOpenAll = () => {
    if (!openAllConfirm) return
    const { links } = openAllConfirm
    setOpenAllConfirm(null)
    for (const l of links) {
      if (l.url) {
        window.open(l.url, '_blank', 'noopener,noreferrer')
      }
    }
  }

  // 默认展开所有带子分类的分组
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

  // 快捷键支持：按 '/' 或 'F1' 聚焦搜索
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
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

  // 监听滚动以高亮左侧分类与显示回到顶部
  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300)
      if (keyword.trim()) return

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

  // 展开所有分类选项用于表单下拉 (扁平化)
  const { flatCategoryOptions, rootCategoryOptions } = useMemo(() => {
    const flat: { id: number; name: string }[] = []
    const roots: { id: number; name: string }[] = []
    if (data?.groups) {
      for (const g of data.groups) {
        roots.push({ id: g.id, name: g.name })
        flat.push({ id: g.id, name: g.name })
        for (const c of g.categories || []) {
          flat.push({ id: c.id, name: `${g.name} / ${c.name}` })
        }
      }
    }
    return { flatCategoryOptions: flat, rootCategoryOptions: roots }
  }, [data?.groups])

  // 站内搜索过滤
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

  // ==================== 链接操作逻辑 ====================
  const openCreateLinkModal = (defaultCatId?: number) => {
    const firstCatId = defaultCatId || flatCategoryOptions[0]?.id || 0
    setLinkFormError(null)
    setLinkIconFile(null)
    setLinkModal({
      open: true,
      mode: 'create',
      title: '',
      url: '',
      backupUrl: '',
      categoryId: firstCatId,
      description: '',
      iconPath: '',
      iconUrl: null,
      isPrivate: false,
      sort: 10,
    })
  }

  const openEditLinkModal = (link: LinkDTO) => {
    setLinkFormError(null)
    setLinkIconFile(null)
    setLinkModal({
      open: true,
      mode: 'edit',
      id: link.id,
      title: link.title,
      url: link.url,
      backupUrl: link.backupUrl || '',
      categoryId: link.categoryId,
      description: link.description || '',
      iconPath: link.iconPath || '',
      iconUrl: link.iconUrl,
      isPrivate: link.isPrivate,
      sort: link.sort ?? 10,
    })
  }

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkModal.title.trim()) {
      setLinkFormError('请输入链接标题')
      return
    }
    if (!linkModal.url.trim()) {
      setLinkFormError('请输入链接地址')
      return
    }
    if (!linkModal.categoryId) {
      setLinkFormError('请选择所属分类')
      return
    }

    setLinkSubmitting(true)
    setLinkFormError(null)
    try {
      const payload = {
        title: linkModal.title.trim(),
        url: linkModal.url.trim(),
        backupUrl: linkModal.backupUrl.trim() || null,
        categoryId: Number(linkModal.categoryId),
        description: linkModal.description.trim() || null,
        iconPath: linkModal.iconPath || null,
        isPrivate: linkModal.isPrivate,
        sort: Number(linkModal.sort) || 10,
      }

      if (linkModal.mode === 'create') {
        const created = await api.createLink(payload)
        if (linkIconFile) {
          await api.uploadLinkIcon(created.id, linkIconFile)
        }
      } else if (linkModal.id) {
        await api.updateLink(linkModal.id, payload)
      }

      setLinkIconFile(null)
      await invalidate()
      setLinkModal((prev) => ({ ...prev, open: false }))
    } catch (err) {
      setLinkFormError(err instanceof Error ? err.message : '保存链接失败')
    } finally {
      setLinkSubmitting(false)
    }
  }

  const handleDeleteLink = async () => {
    if (!deletingLink) return
    setIsDeletingLink(true)
    try {
      await api.deleteLink(deletingLink.id)
      await invalidate()
      setDeletingLink(null)
    } catch (err) {
      console.error('Delete link failed', err)
    } finally {
      setIsDeletingLink(false)
    }
  }

  // ==================== 分类操作逻辑 ====================
  const openCreateCategoryModal = (defaultParentId?: number | null) => {
    setCategoryFormError(null)
    setCategoryModal({
      open: true,
      mode: 'create',
      name: '',
      parentId: defaultParentId ?? null,
      icon: '',
      description: '',
      sort: 0,
      isPrivate: false,
    })
  }

  const openEditCategoryModal = (cat: {
    id: number
    name: string
    parentId?: number | null
    icon?: string | null
    description?: string | null
    sort?: number
    isPrivate?: boolean
  }) => {
    setCategoryFormError(null)
    setCategoryModal({
      open: true,
      mode: 'edit',
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId ?? null,
      icon: cat.icon || '',
      description: cat.description || '',
      sort: cat.sort ?? 0,
      isPrivate: !!cat.isPrivate,
    })
  }

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryModal.name.trim()) {
      setCategoryFormError('请输入分类名称')
      return
    }

    setCategorySubmitting(true)
    setCategoryFormError(null)
    try {
      const payload = {
        name: categoryModal.name.trim(),
        parentId: categoryModal.parentId ? Number(categoryModal.parentId) : null,
        icon: categoryModal.icon.trim() || null,
        description: categoryModal.description.trim() || null,
        sort: Number(categoryModal.sort) || 0,
        isPrivate: categoryModal.isPrivate,
      }

      if (categoryModal.mode === 'create') {
        await api.createCategory(payload)
      } else if (categoryModal.id) {
        await api.updateCategory(categoryModal.id, payload)
      }

      await invalidate()
      setCategoryModal((prev) => ({ ...prev, open: false }))
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : '保存分类失败')
    } finally {
      setCategorySubmitting(false)
    }
  }

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return
    setIsDeletingCat(true)
    try {
      await api.deleteCategory(
        deletingCategory.id,
        deleteCategoryMode,
        deleteCategoryMode === 'move' ? moveTargetCatId : undefined,
      )
      await invalidate()
      setDeletingCategory(null)
      setCategoryModal((prev) => ({ ...prev, open: false }))
    } catch (err) {
      console.error('Delete category failed', err)
    } finally {
      setIsDeletingCat(false)
    }
  }

  // 二维码下载与复制
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

  const handleCheckLink = async (l: LinkDTO) => {
    try {
      await api.checkLink(l.id)
      invalidate()
    } catch {
      // ignore
    }
  }

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#f4f5f7] dark:bg-[#0f1114]'>
        <div className='flex flex-col items-center gap-3 text-zinc-400'>
          <RefreshCw className='size-8 animate-spin text-zinc-600 dark:text-zinc-300' />
          <p className='text-sm font-medium'>正在加载导航数据...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#f4f5f7] dark:bg-[#0f1114] p-4'>
        <div className='max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'>
          <div className='flex items-center gap-3 text-red-500'>
            <AlertTriangle className='size-6' />
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>加载失败</h2>
          </div>
          <p className='mt-2 text-sm text-zinc-500 dark:text-zinc-400'>{error.message}</p>
          <button
            type='button'
            onClick={() => window.location.reload()}
            className='mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
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
      className='min-h-screen bg-[#f4f5f7] dark:bg-[#0f1114] text-zinc-800 dark:text-zinc-100 transition-colors duration-200 font-sans'
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
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-60 flex-col border-r border-zinc-200/80 bg-[#fafafa] transition-transform duration-300 ease-in-out dark:border-zinc-800/80 dark:bg-[#15171a] md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* 顶部 Logo 与站点名称 */}
        <div className='flex h-16 items-center px-4 border-b border-zinc-200/60 dark:border-zinc-800/60'>
          <div className='flex items-center gap-2.5 truncate'>
            <Logo src={data.site.logoUrl} alt={data.site.name} className='size-8' />
            <button
              type='button'
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className='truncate text-left text-base font-bold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300'
            >
              {data.site.name || 'NextNav'}
            </button>
          </div>
        </div>

        {/* 分类导航树形列表 (纯净无编辑按钮) */}
        <nav className='flex-1 overflow-y-auto px-3 py-4 space-y-1 select-none no-scrollbar hover:scrollbar-thin'>
          {data.groups.map((group) => {
            const hasSub = group.categories && group.categories.length > 0
            const isGroupOpen = !!openGroupIds[group.id]
            const isGroupActive = activeId === `group-${group.id}`

            return (
              <div key={group.id} className='space-y-0.5'>
                {/* 一级分类项 */}
                {isAdmin ? (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition cursor-pointer ${
                          isGroupActive
                            ? 'bg-zinc-200/80 text-zinc-950 dark:bg-zinc-800/80 dark:text-zinc-100 font-semibold shadow-2xs'
                            : 'text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100'
                        }`}
                        onClick={() => scrollToCategory(`group-${group.id}`)}
                      >
                        <div className='flex items-center gap-2.5 truncate'>
                          <CategoryIcon
                            icon={group.icon || group.iconUrl}
                            isRoot={true}
                            className={`size-4 shrink-0 ${isGroupActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300'}`}
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
                            className='rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition'
                          >
                            {isGroupOpen ? (
                              <ChevronDown className='size-3.5' />
                            ) : (
                              <ChevronRight className='size-3.5' />
                            )}
                          </button>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className='w-36'>
                      <ContextMenuItem onClick={() => openEditCategoryModal(group)}>
                        <SquarePen className='mr-2 size-3.5 text-zinc-500' />
                        <span>编辑分类</span>
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant='destructive'
                        onClick={() => setDeletingCategory({ id: group.id, name: group.name })}
                      >
                        <Trash2 className='mr-2 size-3.5' />
                        <span>删除分类</span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ) : (
                  <div
                    className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition cursor-pointer ${
                      isGroupActive
                        ? 'bg-zinc-200/80 text-zinc-950 dark:bg-zinc-800/80 dark:text-zinc-100 font-semibold shadow-2xs'
                        : 'text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100'
                    }`}
                    onClick={() => scrollToCategory(`group-${group.id}`)}
                  >
                    <div className='flex items-center gap-2.5 truncate'>
                      <CategoryIcon
                        icon={group.icon || group.iconUrl}
                        isRoot={true}
                        className={`size-4 shrink-0 ${isGroupActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300'}`}
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
                        className='rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition'
                      >
                        {isGroupOpen ? (
                          <ChevronDown className='size-3.5' />
                        ) : (
                          <ChevronRight className='size-3.5' />
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* 二级子分类列表 (纯净无编辑按钮) */}
                {hasSub && isGroupOpen && (
                  <div className='pl-6 space-y-0.5 pt-0.5'>
                    {group.categories.map((sub) => {
                      const isSubActive = activeId === `cat-${sub.id}`
                      return isAdmin ? (
                        <ContextMenu key={sub.id}>
                          <ContextMenuTrigger asChild>
                            <div
                              onClick={() => scrollToCategory(`cat-${sub.id}`)}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                                isSubActive
                                  ? 'bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-100 font-medium'
                                  : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200'
                              }`}
                            >
                              <CategoryIcon
                                icon={sub.icon || sub.iconUrl}
                                isRoot={false}
                                className='size-3 shrink-0 text-zinc-400 dark:text-zinc-500'
                              />
                              <span className='truncate'>{sub.name}</span>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className='w-36'>
                            <ContextMenuItem onClick={() => openEditCategoryModal({ ...sub, parentId: group.id })}>
                              <SquarePen className='mr-2 size-3.5 text-zinc-500' />
                              <span>编辑分类</span>
                            </ContextMenuItem>
                            <ContextMenuItem
                              variant='destructive'
                              onClick={() => setDeletingCategory({ id: sub.id, name: sub.name })}
                            >
                              <Trash2 className='mr-2 size-3.5' />
                              <span>删除分类</span>
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ) : (
                        <div
                          key={sub.id}
                          onClick={() => scrollToCategory(`cat-${sub.id}`)}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                            isSubActive
                              ? 'bg-zinc-200/70 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-100 font-medium'
                              : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200'
                          }`}
                        >
                          <CategoryIcon
                            icon={sub.icon || sub.iconUrl}
                            isRoot={false}
                            className='size-3 shrink-0 text-zinc-400 dark:text-zinc-500'
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
      </aside>

      {/* ===================== 右侧主内容区 (Main Content) ===================== */}
      <main className='min-h-screen flex flex-col md:ml-60 transition-all'>
        {/* 移动端顶栏 */}
        <div className='sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-[#15171a]/90 md:hidden'>
          <button
            type='button'
            onClick={() => setSidebarOpen(true)}
            className='rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            aria-label='打开分类侧边栏'
          >
            <Menu className='size-5' />
          </button>
          <span className='font-bold text-zinc-900 dark:text-zinc-100'>
            {data.site.name || 'NextNav'}
          </span>
          <div className='w-8' />
        </div>

        {/* 右侧主内容容器 (水平居中、左右对称留白) */}
        <div className='w-full max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 py-8 pb-44 space-y-10'>
          {/* 顶部搜索区 (经典胶囊搜索框 - 黑白灰风格) */}
          <div className='max-w-3xl mx-auto w-full'>
            <form onSubmit={handleSearchSubmit} className='relative w-full'>
              <div className='relative flex items-center rounded-full border border-black/[0.06] bg-white shadow-xs transition-all focus-within:border-black/20 focus-within:shadow-md dark:border-white/[0.08] dark:bg-[#181a1f] dark:focus-within:border-white/20'>
                {/* 搜索引擎下拉选择 */}
                <div ref={engineDropdownRef} className='relative shrink-0'>
                  <button
                    type='button'
                    onClick={() => setShowEngineDropdown(!showEngineDropdown)}
                    className='flex items-center gap-1 pl-4 pr-3 py-3 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition'
                  >
                    <span>{SEARCH_ENGINES[engineIndex].name}</span>
                    <ChevronDown className='size-3 text-zinc-400' />
                  </button>

                  {showEngineDropdown && (
                    <div className='absolute left-2 top-full mt-1.5 z-40 w-28 rounded-xl border border-black/[0.06] bg-white p-1 shadow-lg dark:border-white/[0.08] dark:bg-[#1c1f26] text-xs'>
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
                              ? 'bg-zinc-100 text-zinc-950 font-semibold dark:bg-zinc-800 dark:text-zinc-100'
                              : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60'
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
                <div className='h-4 w-px bg-black/[0.08] dark:bg-white/[0.1]' />

                {/* 搜索输入框 */}
                <input
                  ref={searchInputRef}
                  type='search'
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder='请输入关键词检索或外部搜索...'
                  className='w-full bg-transparent px-3 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-hidden dark:text-zinc-100 dark:placeholder-zinc-500'
                />

                {/* 清除按钮 */}
                {keyword && (
                  <button
                    type='button'
                    onClick={() => {
                      setKeyword('')
                      searchInputRef.current?.focus()
                    }}
                    className='p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                    title='清空输入'
                  >
                    <X className='size-4' />
                  </button>
                )}

                {/* 搜索按钮 */}
                <button
                  type='submit'
                  className='mr-1.5 flex size-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white transition'
                  title='搜索'
                >
                  <Search className='size-4' />
                </button>
              </div>
            </form>

            {/* 搜索提示或匹配统计 */}
            {keyword.trim() && (
              <div className='mt-2.5 flex items-center justify-between px-2 text-xs text-zinc-500 dark:text-zinc-400'>
                <span>站内匹配到 {totalMatched} 个链接</span>
                <button
                  type='button'
                  onClick={() => setKeyword('')}
                  className='text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                >
                  清除检索
                </button>
              </div>
            )}
          </div>

          {/* 链接分类展示区 */}
          <div className='space-y-10'>
          {isInitialEmpty ? (
            <div className='rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800'>
              <p className='text-sm text-zinc-500 dark:text-zinc-400'>暂无导航链接数据。</p>
              {isAdmin && (
                <div className='mt-3 flex justify-center gap-2'>
                  <button
                    type='button'
                    onClick={() => openCreateCategoryModal(null)}
                    className='rounded-xl border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                  >
                    + 新建分类
                  </button>
                  <button
                    type='button'
                    onClick={() => openCreateLinkModal()}
                    className='rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                  >
                    + 添加链接
                  </button>
                </div>
              )}
            </div>
          ) : keyword.trim() && totalMatched === 0 ? (
            <div className='rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800'>
              <p className='text-sm text-zinc-500 dark:text-zinc-400'>
                未找到与 “{keyword}” 相关的站内链接。
              </p>
              <button
                type='button'
                onClick={() => {
                  setKeyword('')
                  searchInputRef.current?.focus()
                }}
                className='mt-3 text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
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

              const allGroupLinks = [
                ...group.links,
                ...group.categories.flatMap((c) => c.links),
              ]

              return (
                <div
                  key={group.id}
                  id={`group-${group.id}`}
                  data-nav-section
                  className='group/root scroll-mt-6 space-y-5'
                >
                  {/* 一级分类标题行 (悬浮在分类或直属链接区域时显现编辑按钮) */}
                  <div className='flex items-center justify-between pt-2'>
                    <div className='flex items-baseline gap-2.5'>
                      <div className='flex items-center gap-2'>
                        <CategoryIcon
                          icon={group.icon || group.iconUrl}
                          isRoot={true}
                          className='size-4 text-zinc-800 dark:text-zinc-200'
                        />
                        <h2 className='text-lg font-bold text-zinc-900 dark:text-zinc-100'>
                          {group.name}
                        </h2>
                      </div>
                      {group.description && (
                        <span className='text-xs text-zinc-400 dark:text-zinc-500 font-normal'>
                          {group.description}
                        </span>
                      )}
                    </div>

                    {/* 分类操作按钮组 */}
                    <div className='flex items-center gap-1.5'>
                      {allGroupLinks.length > 0 && (
                        <button
                          type='button'
                          onClick={() => handleOpenAll(group.name, allGroupLinks)}
                          className='flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition'
                          title={`一键打开此分类下全部 ${allGroupLinks.length} 个链接`}
                        >
                          <ExternalLink className='size-3.5' />
                          <span className='hidden sm:inline'>打开全部 ({allGroupLinks.length})</span>
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type='button'
                          onClick={() => openEditCategoryModal(group)}
                          className='opacity-0 group-hover/root:opacity-100 flex size-7 items-center justify-center rounded-lg border border-black/[0.06] bg-white text-zinc-400 shadow-2xs hover:border-black/20 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:text-white dark:hover:border-white/20 transition'
                          title='编辑此分类'
                        >
                          <SquarePen className='size-3.5' />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 一级分类直属链接网格 */}
                  {group.links.length > 0 && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5'>
                      {group.links.map((link) => (
                        <LinkCard
                          key={link.id}
                          link={link}
                          newTab={data.site.openInNewTab}
                          isAdmin={isAdmin}
                          onShowQR={(url, title) => setQrModal({ open: true, url, title })}
                          onEdit={(l) => openEditLinkModal(l)}
                          onDelete={(l) => setDeletingLink(l)}
                          onCheck={(l) => handleCheckLink(l)}
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
                        className='group/sub scroll-mt-6 space-y-3 pt-2'
                      >
                        {/* 二级子分类标题行 (悬浮在子分类或其链接区域时显现编辑按钮) */}
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2'>
                            <CategoryIcon
                              icon={sub.icon || sub.iconUrl}
                              isRoot={false}
                              className='size-3.5 text-zinc-400 dark:text-zinc-500'
                            />
                            <h3 className='text-sm font-semibold text-zinc-800 dark:text-zinc-200'>
                              {sub.name}
                            </h3>
                            {sub.description && (
                              <span className='text-xs text-zinc-400 dark:text-zinc-500 font-normal'>
                                - {sub.description}
                              </span>
                            )}
                          </div>

                          <div className='flex items-center gap-1.5'>
                            {sub.links.length > 0 && (
                              <button
                                type='button'
                                onClick={() => handleOpenAll(sub.name, sub.links)}
                                className='flex items-center gap-1 px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition'
                                title={`一键打开子分类下全部 ${sub.links.length} 个链接`}
                              >
                                <ExternalLink className='size-3' />
                                <span className='hidden sm:inline'>打开全部 ({sub.links.length})</span>
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type='button'
                                onClick={() => openEditCategoryModal({ ...sub, parentId: group.id })}
                                className='opacity-0 group-hover/sub:opacity-100 flex size-6 items-center justify-center rounded-md border border-black/[0.06] bg-white text-zinc-400 hover:border-black/20 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:hover:text-white dark:hover:border-white/20 transition'
                                title='编辑子分类'
                              >
                                <SquarePen className='size-3' />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 二级子分类链接卡片网格 */}
                        {sub.links.length > 0 ? (
                          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5'>
                            {sub.links.map((link) => (
                              <LinkCard
                                key={link.id}
                                link={link}
                                newTab={data.site.openInNewTab}
                                isAdmin={isAdmin}
                                onShowQR={(url, title) => setQrModal({ open: true, url, title })}
                                onEdit={(l) => openEditLinkModal(l)}
                                onDelete={(l) => setDeletingLink(l)}
                                onCheck={(l) => handleCheckLink(l)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className='rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800'>
                            暂无链接
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
          </div>
        </div>
      </main>

      {/* ===================== 右下角悬浮工具条 (统一添加链接 & 控制) ===================== */}
      <div className='fixed right-6 bottom-6 z-40 flex flex-col items-center gap-2 select-none'>
        <div className='flex flex-col items-center gap-1.5 rounded-2xl border border-black/[0.06] bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181a1f]/95'>
          {/* 统一添加链接快捷入口 (黑白灰配色) */}
          {isAdmin && (
            <button
              type='button'
              onClick={() => openCreateLinkModal()}
              className='flex size-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition'
              title='添加链接'
            >
              <Plus className='size-5' />
            </button>
          )}

          {/* 深浅主题切换 */}
          <button
            type='button'
            onClick={() => {
              toggleTheme()
              setThemeState(getTheme())
            }}
            className='flex size-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition'
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
            className='flex size-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition disabled:opacity-50'
            title='刷新导航数据'
            aria-label='刷新导航数据'
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-zinc-900 dark:text-zinc-100' : ''}`} />
          </button>

          {/* 后台管理入口 / 登录入口 */}
          {isAdmin ? (
            <Link
              to='/admin'
              className='flex size-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition'
              title='进入管理后台'
            >
              <Settings className='size-4' />
            </Link>
          ) : (
            <Link
              to='/login'
              className='flex size-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white transition'
              title='登录'
            >
              <User className='size-4' />
            </Link>
          )}

          {/* 退出登录 (仅管理员) */}
          {isAdmin && (
            <button
              type='button'
              onClick={async () => {
                await api.logout()
                await clearHomeCache()
                window.location.reload()
              }}
              className='flex size-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-red-50 hover:text-red-600 dark:text-zinc-300 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition'
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
            className='flex size-9 items-center justify-center rounded-full border border-zinc-200/80 bg-white/95 text-zinc-600 shadow-md backdrop-blur-md hover:bg-zinc-900 hover:text-white dark:border-zinc-800 dark:bg-[#1a1d24]/95 dark:text-zinc-300 dark:hover:bg-zinc-100 dark:hover:text-zinc-900 transition'
            title='回到顶部'
          >
            <ArrowUp className='size-4' />
          </button>
        )}
      </div>

      {/* ===================== 前台原生链接编辑/新建 Modal (纯净黑白灰) ===================== */}
      {linkModal.open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs overflow-y-auto'>
          <div className='w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150 my-8'>
            <div className='flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800'>
              <h3 className='text-base font-bold text-zinc-900 dark:text-zinc-100'>
                {linkModal.mode === 'create' ? '添加链接' : '编辑链接'}
              </h3>
              <button
                type='button'
                onClick={() => setLinkModal((prev) => ({ ...prev, open: false }))}
                className='rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              >
                <X className='size-4' />
              </button>
            </div>

            {linkFormError && (
              <div className='mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400'>
                {linkFormError}
              </div>
            )}

            <form onSubmit={handleSaveLink} className='mt-4 space-y-4 text-xs'>
              {/* 标题 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  链接标题 <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  value={linkModal.title}
                  onChange={(e) => setLinkModal({ ...linkModal, title: e.target.value })}
                  placeholder='例如：GitHub'
                  required
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                />
              </div>

              {/* 网址 URL */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  网址 URL <span className='text-red-500'>*</span>
                </label>
                <div className='flex items-center gap-2'>
                  <input
                    type='url'
                    value={linkModal.url}
                    onChange={(e) => setLinkModal({ ...linkModal, url: e.target.value })}
                    placeholder='https://...'
                    required
                    className='flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                  />
                  <button
                    type='button'
                    disabled={linkFetchingMeta || !linkModal.url.trim()}
                    onClick={handleAutoFetchMeta}
                    className='shrink-0 flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer'
                    title='自动获取网站标题与描述'
                  >
                    <Sparkles className='size-3.5' />
                    <span>{linkFetchingMeta ? '抓取中...' : '自动获取'}</span>
                  </button>
                </div>
              </div>

              {/* 所属分类与备用网址 (两列) */}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                    所属分类 <span className='text-red-500'>*</span>
                  </label>
                  <select
                    value={linkModal.categoryId}
                    onChange={(e) => setLinkModal({ ...linkModal, categoryId: Number(e.target.value) })}
                    className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                  >
                    {flatCategoryOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                    备用网址
                  </label>
                  <input
                    type='url'
                    value={linkModal.backupUrl}
                    onChange={(e) => setLinkModal({ ...linkModal, backupUrl: e.target.value })}
                    placeholder='可选镜像或内网地址'
                    className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                  />
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  网站描述
                </label>
                <textarea
                  value={linkModal.description}
                  onChange={(e) => setLinkModal({ ...linkModal, description: e.target.value })}
                  placeholder='简短的功能介绍或备注信息'
                  rows={2}
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 resize-none'
                />
              </div>

              {/* 图标 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  链接图标
                </label>
                <div className='flex items-center gap-3'>
                  <div className='flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full'>
                    <SiteIcon
                      name={linkModal.title || '?'}
                      url={linkModal.url}
                      iconUrl={linkModal.iconUrl}
                      size={40}
                    />
                  </div>
                  <input
                    ref={linkIconInputRef}
                    type='file'
                    accept='image/png,image/jpeg,image/webp,image/x-icon'
                    className='hidden'
                    onChange={handleLinkIconChange}
                  />
                  <button
                    type='button'
                    disabled={linkUploadingIcon}
                    onClick={() => linkIconInputRef.current?.click()}
                    className='flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition'
                  >
                    <Upload className='size-3.5' />
                    <span>{linkUploadingIcon ? '上传中...' : '上传图标'}</span>
                  </button>
                  {linkModal.iconUrl ? (
                    <button
                      type='button'
                      disabled={linkUploadingIcon}
                      onClick={handleClearLinkIcon}
                      className='flex items-center gap-1 rounded-xl px-2 py-2 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-red-400 transition'
                    >
                      <Trash2 className='size-3.5' />
                      <span>移除</span>
                    </button>
                  ) : null}
                  <span className='text-[11px] text-zinc-400 dark:text-zinc-500'>
                    不设置时使用抓取图标或首字母
                  </span>
                </div>
              </div>

              {/* 排序与私有状态 */}
              <div className='flex items-center justify-between pt-1'>
                <div className='flex items-center gap-2'>
                  <label className='font-medium text-zinc-700 dark:text-zinc-300'>排序:</label>
                  <input
                    type='number'
                    value={linkModal.sort}
                    onChange={(e) => setLinkModal({ ...linkModal, sort: Number(e.target.value) })}
                    className='w-20 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                  />
                </div>

                <label className='flex items-center gap-2 cursor-pointer font-medium text-zinc-700 dark:text-zinc-300'>
                  <input
                    type='checkbox'
                    checked={linkModal.isPrivate}
                    onChange={(e) => setLinkModal({ ...linkModal, isPrivate: e.target.checked })}
                    className='size-4 rounded accent-zinc-900 dark:accent-zinc-100'
                  />
                  <span>设为私有 (仅自己可见)</span>
                </label>
              </div>

              {/* 底部操作按钮 */}
              <div className='mt-6 flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800'>
                <button
                  type='button'
                  onClick={() => setLinkModal((prev) => ({ ...prev, open: false }))}
                  className='rounded-xl border border-zinc-200 px-4 py-2 font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition'
                >
                  取消
                </button>
                <button
                  type='submit'
                  disabled={linkSubmitting}
                  className='rounded-xl bg-zinc-900 px-5 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 transition'
                >
                  {linkSubmitting ? '正在保存...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== 前台原生分类编辑/新建 Modal (纯净黑白灰) ===================== */}
      {categoryModal.open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs overflow-y-auto'>
          <div className='w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150 my-8'>
            <div className='flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800'>
              <h3 className='text-base font-bold text-zinc-900 dark:text-zinc-100'>
                {categoryModal.mode === 'create' ? '新建分类' : '编辑分类'}
              </h3>
              <button
                type='button'
                onClick={() => setCategoryModal((prev) => ({ ...prev, open: false }))}
                className='rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              >
                <X className='size-4' />
              </button>
            </div>

            {categoryFormError && (
              <div className='mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400'>
                {categoryFormError}
              </div>
            )}

            <form onSubmit={handleSaveCategory} className='mt-4 space-y-4 text-xs'>
              {/* 分类名称 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  分类名称 <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  value={categoryModal.name}
                  onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })}
                  placeholder='例如：在线工具'
                  required
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                />
              </div>

              {/* 父级分类 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  父级分类
                </label>
                <select
                  value={categoryModal.parentId ?? ''}
                  onChange={(e) =>
                    setCategoryModal({
                      ...categoryModal,
                      parentId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                >
                  <option value=''>作为顶级分类 (一级)</option>
                  {rootCategoryOptions
                    .filter((r) => r.id !== categoryModal.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        作为【{r.name}】的子分类
                      </option>
                    ))}
                </select>
              </div>

              {/* 分类图标 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  分类图标 (Emoji / 图标名 / 图片地址)
                </label>
                <input
                  type='text'
                  value={categoryModal.icon}
                  onChange={(e) => setCategoryModal({ ...categoryModal, icon: e.target.value })}
                  placeholder='例如：folder, globe, 🚀 或 https://...'
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                />
                <div className='flex flex-wrap items-center gap-1.5 mt-2'>
                  <span className='text-[11px] text-zinc-400'>快捷点选:</span>
                  {COMMON_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type='button'
                      onClick={() => setCategoryModal({ ...categoryModal, icon: ic })}
                      className='inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                    >
                      <CategoryIcon icon={ic} size={12} />
                      <span>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className='block font-medium text-zinc-700 dark:text-zinc-300 mb-1'>
                  分类描述
                </label>
                <input
                  type='text'
                  value={categoryModal.description}
                  onChange={(e) => setCategoryModal({ ...categoryModal, description: e.target.value })}
                  placeholder='分类的简要用途说明'
                  className='w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 outline-hidden focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400'
                />
              </div>

              {/* 排序与私有状态 */}
              <div className='flex items-center justify-between pt-1'>
                <div className='flex items-center gap-2'>
                  <label className='font-medium text-zinc-700 dark:text-zinc-300'>排序:</label>
                  <input
                    type='number'
                    value={categoryModal.sort}
                    onChange={(e) => setCategoryModal({ ...categoryModal, sort: Number(e.target.value) })}
                    className='w-20 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                  />
                </div>

                <label className='flex items-center gap-2 cursor-pointer font-medium text-zinc-700 dark:text-zinc-300'>
                  <input
                    type='checkbox'
                    checked={categoryModal.isPrivate}
                    onChange={(e) => setCategoryModal({ ...categoryModal, isPrivate: e.target.checked })}
                    className='size-4 rounded accent-zinc-900 dark:accent-zinc-100'
                  />
                  <span>设为私有分类</span>
                </label>
              </div>

              {/* 底部操作按钮 */}
              <div className='mt-6 flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800'>
                {categoryModal.mode === 'edit' && categoryModal.id ? (
                  <button
                    type='button'
                    onClick={() => {
                      setDeletingCategory({ id: categoryModal.id!, name: categoryModal.name })
                    }}
                    className='flex items-center gap-1 text-xs text-red-600 hover:underline dark:text-red-400'
                  >
                    <Trash2 className='size-3.5' />
                    <span>删除此分类</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={() => setCategoryModal((prev) => ({ ...prev, open: false }))}
                    className='rounded-xl border border-zinc-200 px-4 py-2 font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition'
                  >
                    取消
                  </button>
                  <button
                    type='submit'
                    disabled={categorySubmitting}
                    className='rounded-xl bg-zinc-900 px-5 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 transition'
                  >
                    {categorySubmitting ? '正在保存...' : '保存'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== 原生轻量删除分类确认 Modal ===================== */}
      {deletingCategory && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs'>
          <div className='w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150'>
            <h3 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              确认删除分类 “{deletingCategory.name}”？
            </h3>
            <div className='mt-3 space-y-2 text-xs text-zinc-600 dark:text-zinc-300'>
              <label className='flex items-center gap-2 cursor-pointer'>
                <input
                  type='radio'
                  name='deleteCategoryMode'
                  checked={deleteCategoryMode === 'delete'}
                  onChange={() => setDeleteCategoryMode('delete')}
                />
                <span>直接删除分类及其所有链接</span>
              </label>

              <label className='flex items-center gap-2 cursor-pointer'>
                <input
                  type='radio'
                  name='deleteCategoryMode'
                  checked={deleteCategoryMode === 'move'}
                  onChange={() => setDeleteCategoryMode('move')}
                />
                <span>保留链接，转移至其他分类:</span>
              </label>

              {deleteCategoryMode === 'move' && (
                <select
                  value={moveTargetCatId ?? ''}
                  onChange={(e) => setMoveTargetCatId(e.target.value ? Number(e.target.value) : undefined)}
                  className='mt-1 w-full rounded-lg border border-zinc-200 p-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800'
                >
                  <option value=''>请选择目标分类</option>
                  {flatCategoryOptions
                    .filter((c) => c.id !== deletingCategory.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div className='mt-5 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setDeletingCategory(null)}
                disabled={isDeletingCat}
                className='rounded-xl border border-zinc-200 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
              >
                取消
              </button>
              <button
                type='button'
                onClick={handleDeleteCategory}
                disabled={isDeletingCat || (deleteCategoryMode === 'move' && !moveTargetCatId)}
                className='rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
              >
                {isDeletingCat ? '正在删除...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 原生轻量二维码 Modal ===================== */}
      {qrModal.open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs'>
          <div className='w-full max-w-xs rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] text-center animate-in fade-in zoom-in-95 duration-150'>
            <div className='flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800'>
              <h3 className='text-sm font-semibold truncate text-zinc-900 dark:text-zinc-100'>
                {qrModal.title || '链接二维码'}
              </h3>
              <button
                type='button'
                onClick={() => setQrModal((prev) => ({ ...prev, open: false }))}
                className='rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              >
                <X className='size-4' />
              </button>
            </div>

            <div className='flex flex-col items-center justify-center py-4'>
              <div className='rounded-xl border border-zinc-100 bg-white p-2.5 shadow-inner'>
                <canvas ref={qrCanvasRef} className='block' />
              </div>
              <p className='mt-3 max-w-full truncate px-2 text-xs text-zinc-400 dark:text-zinc-500' title={qrModal.url}>
                {qrModal.url}
              </p>
            </div>

            <div className='grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800'>
              <button
                type='button'
                onClick={handleCopyQRLink}
                className='flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition'
              >
                {qrCopied ? <Check className='size-3.5 text-green-500' /> : <Copy className='size-3.5' />}
                <span>{qrCopied ? '已复制' : '复制链接'}</span>
              </button>
              <button
                type='button'
                onClick={handleDownloadQR}
                className='flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition'
              >
                <Download className='size-3.5' />
                <span>下载 PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 原生轻量删除链接确认 Modal ===================== */}
      {deletingLink && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs'>
          <div className='w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150'>
            <h3 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              确认删除链接
            </h3>
            <p className='mt-2 text-xs text-zinc-500 dark:text-zinc-400'>
              是否确定删除 “{deletingLink.title}”？此操作不可撤销。
            </p>
            <div className='mt-5 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setDeletingLink(null)}
                disabled={isDeletingLink}
                className='rounded-xl border border-zinc-200 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
              >
                取消
              </button>
              <button
                type='button'
                onClick={handleDeleteLink}
                disabled={isDeletingLink}
                className='rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
              >
                {isDeletingLink ? '正在删除...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 一键全部打开确认 Modal ===================== */}
      {openAllConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs'>
          <div className='w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1d24] animate-in fade-in zoom-in-95 duration-150'>
            <div className='flex items-center gap-2.5 pb-2'>
              <div className='flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'>
                <ExternalLink className='size-4' />
              </div>
              <h3 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
                批量打开链接
              </h3>
            </div>
            <p className='mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed'>
              即将批量在新标签页打开分类 <span className='font-medium text-zinc-800 dark:text-zinc-200'>“{openAllConfirm.categoryName}”</span> 下的 <span className='font-bold text-zinc-900 dark:text-zinc-100'>{openAllConfirm.links.length}</span> 个链接。
            </p>
            <p className='mt-1 text-[11px] text-zinc-400 dark:text-zinc-500'>
              提示：若浏览器提示弹窗拦截，请在地址栏允许弹出窗口。
            </p>
            <div className='mt-5 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setOpenAllConfirm(null)}
                className='rounded-xl border border-zinc-200 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
              >
                取消
              </button>
              <button
                type='button'
                onClick={confirmOpenAll}
                className='rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
              >
                确认打开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
