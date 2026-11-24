// Typed client for the single /api namespace (docs/API.md).

export type AuthState = 'guest' | 'admin'

export interface LinkDTO {
  id: number
  title: string
  url: string
  backupUrl: string | null
  description: string | null
  iconUrl: string | null
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
  links: LinkDTO[]
  categories: CategoryDTO[]
}

export interface SiteDTO {
  name: string
  description: string
  background: string
  logoUrl: string | null
  openInNewTab: boolean
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
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
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

  setupStatus: () => request<{ installed: boolean }>('/api/setup/status'),

  setup: (username: string, password: string) =>
    request<{ user: { username: string } }>('/api/setup', {
      method: 'POST',
      ...json({ username, password }),
    }),

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
  }>) => request<{ site: SiteDTO }>('/api/settings', { method: 'PATCH', ...json(patch) }),

  createLink: (body: {
    categoryId: number
    title: string
    url: string
    backupUrl?: string | null
    description?: string | null
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
}