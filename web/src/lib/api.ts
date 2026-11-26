// Typed client for the single /api namespace (docs/API.md).

export type AuthState = 'guest' | 'admin'

export interface LinkDTO {
  id: number
  title: string
  url: string
  backupUrl: string | null
  description: string | null
  iconUrl: string | null
  iconPath?: string | null
  customIconUrl?: string | null
  categoryId: number
  categoryName?: string
  isPrivate: boolean
  status: 'ok' | 'warn' | 'dead' | 'unknown'
  sort: number
  lastCheckedAt: number | null
}

export interface CategoryDTO {
  id: number
  name: string
  iconUrl: string | null
  icon?: string | null
  description?: string | null
  sort: number
  isPrivate: boolean
  parentId?: number
  links: LinkDTO[]
}

export interface GroupDTO {
  id: number
  name: string
  iconUrl: string | null
  icon?: string | null
  description?: string | null
  sort: number
  isPrivate: boolean
  links: LinkDTO[]
  categories: CategoryDTO[]
}

export interface SiteDTO {
  name: string
  description: string
  background: string
  logoUrl: string | null
  openInNewTab: boolean
  faviconServiceUrl?: string
}

export interface HomeResponse {
  site: SiteDTO
  groups: GroupDTO[]
}

export interface MeResponse {
  auth: AuthState
  authMethod?: string
  username?: string
}

export interface TokenInfo {
  prefix: string
  createdAt: number
  lastUsedAt?: number | null
}

export interface CheckItem {
  linkId: number
  title: string
  url: string
  categoryName: string
  status: 'ok' | 'warn' | 'dead' | 'unknown'
  httpStatus?: number | null
  latencyMs?: number | null
  errorType?: string | null
  checkedAt: number
}

export interface MetaResult {
  resolvedUrl: string
  host: string
  title: string
  description: string
  iconUrl?: string | null
  iconPath?: string | null
}

export interface CheckStatusResponse {
  running: boolean
  done: number
  total: number
  startedAt: number
}

export interface SingleCheckResponse {
  status: 'ok' | 'warn' | 'dead' | 'unknown'
  httpStatus?: number | null
  latencyMs?: number | null
  errorType?: string | null
  checkedAt: number
}

export class ApiError extends Error {
  code: string
  field?: string
  status: number

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData must keep the browser-generated multipart boundary; only plain
  // bodies get the JSON content type.
  const isForm = init?.body instanceof FormData
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(init?.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const detail = data?.error ?? {}
    throw new ApiError(
      res.status,
      detail.code ?? 'unknown',
      detail.message ?? res.statusText,
      detail.field,
    )
  }
  return data as T
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

export const api = {
  me: () => request<MeResponse>('/api/me'),

  login: (username: string, password: string) =>
    request<{ user: { username: string } }>('/api/login', {
      method: 'POST',
      ...json({ username, password }),
    }),

  logout: () => request<void>('/api/logout', { method: 'POST' }),

  home: () => request<HomeResponse>('/api/home'),

  settings: () => request<{ site: SiteDTO }>('/api/settings'),

  updateSettings: (patch: Partial<{
    name: string
    description: string
    background: string
    openInNewTab: boolean
    faviconServiceUrl: string
  }>) => request<{ site: SiteDTO }>('/api/settings', { method: 'PATCH', ...json(patch) }),

  createLink: (body: {
    categoryId: number
    title: string
    url: string
    backupUrl?: string | null
    description?: string | null
    iconPath?: string | null
    iconUrl?: string | null
    sort?: number
    isPrivate?: boolean
  }) => request<LinkDTO>('/api/links', { method: 'POST', ...json(body) }),

  updateLink: (id: number, body: Record<string, unknown>) =>
    request<LinkDTO>(`/api/links/${id}`, { method: 'PATCH', ...json(body) }),

  deleteLink: (id: number) => request<void>(`/api/links/${id}`, { method: 'DELETE' }),

  createCategory: (body: {
    name: string
    parentId?: number | null
    icon?: string | null
    sort?: number
    isPrivate?: boolean
    description?: string | null
  }) =>
    request<{ id: number; name: string }>('/api/categories', {
      method: 'POST',
      ...json(body),
    }),

  updateCategory: (
    id: number,
    body: {
      name?: string
      parentId?: number | null
      icon?: string | null
      sort?: number
      isPrivate?: boolean
      description?: string | null
    },
  ) =>
    request<{ id: number; name: string }>(`/api/categories/${id}`, {
      method: 'PATCH',
      ...json(body),
    }),

  deleteCategory: (id: number, links: 'delete' | 'move', moveToCategoryId?: number) => {
    const params = new URLSearchParams({ links })
    if (moveToCategoryId) params.set('moveToCategoryId', String(moveToCategoryId))
    return request<void>(`/api/categories/${id}?${params}`, { method: 'DELETE' })
  },

  clearSample: () =>
    request<{ deletedCategories: number; deletedLinks: number }>('/api/sample/clear', {
      method: 'POST',
    }),

  updateAccount: (body: {
    currentPassword: string
    username?: string
    newPassword?: string
  }) => request<{ username: string }>('/api/settings/account', { method: 'POST', ...json(body) }),

  batchDeleteLinks: (ids: number[]) =>
    request<{ deletedCount: number }>('/api/links/batch-delete', {
      method: 'POST',
      ...json({ ids }),
    }),

  batchMoveLinks: (ids: number[], categoryId: number) =>
    request<{ movedCount: number }>('/api/links/batch-move', {
      method: 'POST',
      ...json({ ids, categoryId }),
    }),

  getToken: () => request<{ token: TokenInfo | null }>('/api/tokens'),

  createToken: () => request<{ token: string; info: TokenInfo }>('/api/tokens', { method: 'POST' }),

  deleteToken: () => request<void>('/api/tokens', { method: 'DELETE' }),

  exportBackup: () => request<unknown>('/api/backup/export'),

  importBackup: (data: unknown, mode: 'merge' | 'overwrite' = 'merge') =>
    request<{ importedCategories: number; importedLinks: number }>(`/api/backup/import?mode=${mode}`, {
      method: 'POST',
      ...json(data),
    }),

  checkLink: (id: number) =>
    request<SingleCheckResponse>(`/api/links/${id}/check`, { method: 'POST' }),

  checkAll: () =>
    request<{ started: boolean; total: number }>('/api/links/check-all', { method: 'POST' }),

  getCheckStatus: () =>
    request<CheckStatusResponse>('/api/check/status'),

  listChecks: (params?: { status?: string; categoryId?: number; page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set('status', params.status)
    if (params?.categoryId) sp.set('categoryId', String(params.categoryId))
    if (params?.page) sp.set('page', String(params.page))
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize))
    const qs = sp.toString()
    return request<{ items: CheckItem[]; total: number; page: number; pageSize: number }>(
      qs ? `/api/checks?${qs}` : '/api/checks',
    )
  },

  fetchMeta: (url: string) =>
    request<MetaResult>('/api/meta', {
      method: 'POST',
      ...json({ url }),
    }),

  uploadLogo: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ logoUrl: string }>('/api/settings/logo', {
      method: 'POST',
      body: formData,
    })
  },

  removeLogo: () =>
    request<void>('/api/settings/logo', {
      method: 'DELETE',
    }),

  uploadLinkIcon: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<LinkDTO>(`/api/links/${id}/icon`, { method: 'POST', body: formData })
  },

  clearLinkIcon: (id: number) =>
    request<LinkDTO>(`/api/links/${id}/icon`, { method: 'DELETE' }),

  purgeIcons: () => request<{ removed: number }>('/api/icons/purge', { method: 'POST' }),
}