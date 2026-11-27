import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './api'

function htmlResponse(status: number, statusText: string) {
  return new Response('<!doctype html> <html> <h1>502 Bad Gateway</h1> </html>', {
    status,
    statusText,
    headers: { 'Content-Type': 'text/html' },
  })
}

describe('api 请求异常处理', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('服务返回 HTML 页面时不抛出 JSON 解析异常', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(200, 'OK')))

    const error = await api.home().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as Error).message).not.toContain('Unexpected token')
    expect((error as Error).message).not.toContain('<html>')
  })

  it('网关返回 HTML 错误页时给出可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(502, 'Bad Gateway')))

    const error = await api.home().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as Error).message).not.toContain('Unexpected token')
  })

  it('网络请求失败时给出可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const error = await api.home().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError)).toMatchObject({ status: 0, code: 'network_error' })
    expect((error as Error).message).toContain('网络连接失败')
  })

  it('正常 JSON 错误响应仍解析出业务错误码与消息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'bad_credentials', message: '用户名或密码错误' } }),
      { status: 401, statusText: 'Unauthorized', headers: { 'Content-Type': 'application/json' } },
    )))

    const error = await api.login('x', 'y').catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError)).toMatchObject({ status: 401, code: 'bad_credentials', message: '用户名或密码错误' })
  })
})
