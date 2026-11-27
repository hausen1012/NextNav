# NextNav API 契约

配套 [FEATURES.md](FEATURES.md) 的 F3 与 [DATA_MODEL.md](DATA_MODEL.md)。
后端 Go 实现，路径统一前缀 `/api`；前端 SPA、curl 脚本、浏览器插件调用的是**同一组端点**。

---

## 0. 通用规则

### 0.1 请求与响应

- `Content-Type: application/json; charset=utf-8`（图标上传除外，用 `multipart/form-data`）
- 时间为 **Unix 毫秒整数**；布尔为 JSON `true/false`
- 未列出的字段一律忽略；响应中未定义字段可能增加，客户端不得因多余字段报错

### 0.2 身份判定

认证中间件按以下顺序判定，得出唯一身份：

| 顺序 | 依据 | 身份 | context.authMethod |
|---|---|---|---|
| 1 | `Authorization: Bearer <token>` 有效 | 管理员 | `token` |
| 2 | 会话 cookie 有效 | 管理员 | `cookie` |
| 3 | 都不满足 | 游客 | `none` |

- 两种凭证同时存在时**以 token 为准**，避免插件携带过期 cookie 干扰。
- 游客只能读公开内容；写接口对游客一律 `401 unauthorized`。
- **CSRF 校验只对 `authMethod = cookie` 且方法为 `POST/PATCH/PUT/DELETE` 的请求生效**：校验 `Origin` 或 `Sec-Fetch-Site` 与站点同源，不通过返回 `403 csrf_failed`。token 请求跳过（凭证显式携带，浏览器不会自动附带）。

### 0.3 可见性过滤（游客）

在 service 层统一执行，而不是各 handler 自己过滤：

- `is_private = 1` 的链接：不出现
- `is_private = 1` 的分类：**整个分类及其所有子分类、其下所有链接都不出现**（无论链接自身标记）
- 计数、`total`、分类标题同样按过滤后的结果计算

### 0.4 错误格式

```json
{ "error": { "code": "invalid_url", "message": "URL 不合法", "field": "url" } }
```

| HTTP | code | 场景 |
|---|---|---|
| 400 | `bad_request` | JSON 解析失败、参数类型错误 |
| 400 | `invalid_url` | URL 非法（非 http/https） |
| 400 | `invalid_name` | 名称为空或超长（> 64 字符） |
| 400 | `invalid_icon` | `iconPath` 不是已落盘的图标文件 |
| 401 | `unauthorized` | 未登录执行写操作 / token 无效 |
| 401 | `bad_credentials` | 用户名或密码错误 |
| 403 | `csrf_failed` | cookie 写操作来源校验失败 |
| 404 | `not_found` | 资源不存在，或对游客不可见 |
| 409 | `duplicate_link` | 同分类下已存在相同 URL |
| 429 | `rate_limited` | 登录失败过多 |
| 500 | `internal` | 其他，`message` 不含堆栈 |

### 0.5 分页与排序

- 列表接口支持 `?page=1&pageSize=50`（`page` 从 1 起，`pageSize` 默认 50、上限 200）
- 响应：`{ "items": [...], "total": 123, "page": 1, "pageSize": 50 }`
- 默认按 `sort ASC`；显式传 `sort=clicks` 时按 `click_count DESC`

### 0.6 CORS

默认不发送任何 CORS 头（同源访问）。若浏览器插件需要跨域调用，在部署时设置 `CORS_ORIGINS`（逗号分隔）；仅对 `Authorization`、`Content-Type` 放宽，**不开启 `credentials`**，即跨域请求只能用 token，不能用 cookie。

---

## 1. 端点总览

### 1.1 核心可用端点

| 方法 | 路径 | 身份 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 公开 | 存活检查，供容器 healthcheck |
| POST | `/api/login` | 公开 | 登录 |
| POST | `/api/logout` | 公开 | 注销 |
| GET | `/api/me` | 任意 | 当前身份 |
| GET | `/api/home` | 任意 | 首页数据（站点信息 + 分类树 + 链接） |
| GET | `/api/categories` | 任意 | 分类列表（支持游客与管理员视图） |
| POST | `/api/categories` | 管理员 | 新建分类 |
| PATCH | `/api/categories/{id}` | 管理员 | 编辑分类 |
| DELETE | `/api/categories/{id}` | 管理员 | 删除分类（支持级联删除或迁移链接） |
| POST | `/api/links` | 管理员 | 新增链接 |
| PATCH | `/api/links/{id}` | 管理员 | 编辑链接 |
| DELETE | `/api/links/{id}` | 管理员 | 删除链接 |
| POST | `/api/links/batch-delete` | 管理员 | 批量删除链接 |
| POST | `/api/links/batch-move` | 管理员 | 批量移动链接到目标分类 |
| POST | `/api/links/{id}/icon` | 管理员 | 上传自定义图标（multipart） |
| DELETE | `/api/links/{id}/icon` | 管理员 | 移除自定义图标 |
| GET | `/api/admin/categories` | 管理员 | 管理端分类树（含全部私有数据与链接） |
| GET | `/api/admin/links` | 管理员 | 管理端扁平链接列表（含分类名） |
| GET | `/api/settings` | 公开 | 站点公开设置 |
| PATCH | `/api/settings` | 管理员 | 修改站点设置 |
| POST | `/api/settings/account` | 管理员 | 修改管理员用户名与密码 |
| GET | `/api/tokens` | 管理员 | 获取当前 API Token 状态与前缀 |
| POST | `/api/tokens` | 管理员 | 生成新 API Token（仅返回一次完整明文） |
| DELETE | `/api/tokens` | 管理员 | 撤回 API Token |
| GET | `/api/backup/export` | 管理员 | 导出全站数据 JSON 备份 |
| POST | `/api/backup/import` | 管理员 | 导入全站数据（支持 merge / overwrite） |
| POST | `/api/icons/purge` | 管理员 | 清理未被引用的图标文件 |
| GET | `/api/favicon/*` | 公开（防盗链） | 抓取或返回站点 Favicon 图标缓存 |
| GET | `/icons/*` | 公开 | 图标静态资源托管 |

### 1.2 规划中扩展端点

| 方法 | 路径 | 身份 | 说明 |
|---|---|---|---|
| GET | `/api/links` | 任意 | 独立链接列表 / 服务端高级搜索 |
| GET | `/api/links/{id}` | 任意 | 链接详情 |
| POST | `/api/links/check-all` | 管理员 | 全站健康检测 |
| GET | `/api/check/status` | 管理员 | 检测进度查询 |
| POST | `/api/meta` | 管理员 | 抓取 URL 元信息预览 |
| GET | `/api/checks` | 管理员 | 检测记录查询（失效清单） |

非 `/api` 的静态路径：`/icons/*`（图标，长缓存）、`/manifest.webmanifest`、`/sw.js`；其余路径一律返回 SPA 的 `index.html`。

---

## 2. 认证

### POST /api/login

```json
{ "username": "admin", "password": "..." }
```

- 成功：`200` + `Set-Cookie: nn_session=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（HTTPS 下加 `Secure`）
- 响应包含会话到期时间 `expiresAt`（Unix 毫秒），用于本地缓存到期管理
- 失败：`401 bad_credentials`
- 限流：同一 IP 10 次失败 / 10 分钟 → `429 rate_limited`

### POST /api/logout

清除 cookie，`204`。

### GET /api/me

```json
{ "auth": "admin", "authMethod": "cookie", "username": "admin", "expiresAt": 1764000000000 }
// 游客
{ "auth": "guest" }
```

- Cookie 管理员的 `expiresAt` 为 Unix 毫秒；token 管理员与游客不返回该字段。
- 私有响应同时返回 `X-NextNav-Session-Expires-At`，供 Service Worker 校验缓存有效期。

---

## 3. 首页与读取

### GET /api/home

一次请求拿全首页数据，**不要在客户端为每个分类各发一次请求**。

```json
{
  "site": {
    "name": "NextNav",
    "description": "",
    "backgroundLight": "",
    "backgroundDark": "",
    "logoUrl": null,
    "openInNewTab": true
  },
  "groups": [
    {
      "id": 1, "name": "开发", "icon": "Code", "iconUrl": null, "description": "常用开发技术与平台", "sort": 1000,
      "links": [],
      "categories": [
        {
          "id": 3, "name": "代码托管", "icon": "FolderGit", "iconUrl": null, "description": null, "sort": 1000,
          "isPrivate": false, "parentId": 1,
          "links": [
            {
              "id": 12, "title": "GitHub", "url": "https://github.com",
              "backupUrl": null, "description": "代码托管",
              "iconUrl": "/icons/ab/cd/abcdef0123456789.webp",
              "isPrivate": false, "status": "ok",
              "sort": 1000, "lastCheckedAt": 1764000000000
            }
          ]
        }
      ]
    }
  ]
}
```

- `groups[].links` 是一级分类直接挂的链接；`categories[].links` 是子分类下的链接。
- `status` 取值 `ok | warn | dead | unknown`，`unknown` = 从未检测。
- 游客请求中，私有分类整块不出现；私有链接不出现在任何 `links` 数组里。
- 前端用 TanStack Query 缓存此响应，写操作后 `invalidateQueries(['home'])`。

`/api/home` 与 `/api/me` 的响应缓存契约：

| 响应头 | 说明 |
|---|---|
| `X-NextNav-Data-Scope` | `public` 或 `private` |
| `Cache-Control` | 始终为 `private, no-cache`，由 Service Worker 管理浏览器缓存 |
| `Vary` | 包含 `Cookie` |
| `X-NextNav-Session-Expires-At` | 仅 Cookie 管理员私有响应返回，Unix 毫秒 |

### GET /api/links

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 搜索词，走 `search_text` 粗筛 + 服务端精排（见 DATA_MODEL 第 3 节） |
| `categoryId` | 限定分类 |
| `parentId` | 限定某个一级分类（含其下所有子分类的链接） |
| `status` | `ok` / `warn` / `dead` / `unknown`，用于失效清单 |
| `sort` | `manual`（默认，按 sort）或 `clicks` |
| `page` / `pageSize` | 分页 |

带 `q` 时不走分页（结果全量返回，前端本地展示），并返回每条的 `matchedField`，便于前端高亮：

```json
{
  "items": [
    { "id": 12, "title": "GitHub", "url": "https://github.com", "iconUrl": "...",
      "categoryId": 3, "categoryName": "代码托管", "matchedField": "title" }
  ],
  "total": 1
}
```

`matchedField` ∈ `title | host | description | category`。

---

## 4. 链接写操作

### POST /api/links

```json
{
  "categoryId": 3,
  "title": "GitHub",
  "url": "https://github.com",
  "backupUrl": null,
  "description": "代码托管",
  "iconPath": "icons/ab/cd/abcdef0123456789.png",
  "iconUrl": "https://github.com/fluidicon.png",
  "sort": 1000,
  "isPrivate": false
}
```

- `categoryId` 与 `url` 为必填项；`url` 必须为 http/https。
- `title` 为空时服务端使用 host 兜底（最多 128 字符）。
- `backupUrl`、`description`、`sort`、`isPrivate` 为可选项。
- `iconPath` 为上传落盘的本地图标文件相对路径（如 `icons/ab/cd/...`，不带前导 `/`）。
- `iconUrl` 为直接配置的图标链接（支持外部 `https://` 链接或站内 `/api/favicon/...` 接口地址）。若同时存在 `iconPath` 与 `iconUrl`，展示时优先使用上传的本地图标；若均未配置则展示首字母占位头像。
- 同分类下 URL 重复 → `409 duplicate_link`。
- 响应 `201` + 完整链接对象（含用于渲染的 `iconUrl`、本地文件路径 `iconPath` 与用户配置链接 `customIconUrl`）。

### PATCH /api/links/{id}

只传需要改的字段（`categoryId` / `title` / `url` / `backupUrl` / `description` / `iconPath` / `iconUrl` / `sort` / `isPrivate`）。任何字段变化都会重算搜索索引。`iconPath` 传 `null` 表示清除上传图标；`iconUrl` 传 `null` 表示清除图标链接。响应 `200` + 完整更新后的链接对象。

### DELETE /api/links/{id}

`204`。同时删除其 `link_check` 记录与图标文件（若不再被引用）。

### POST /api/links/move

```json
{ "ids": [12, 15], "categoryId": 4 }
```

批量移动，追加到目标分类末尾，`204`。

### POST /api/links/batch-delete

```json
{ "ids": [12, 15] }
```

`200 { "deleted": 2 }`。

### POST /api/links/check-all

后台执行，立即返回：

```json
{ "started": true, "total": 49 }
```

已在运行时返回 `409`（复用 `already_installed` 之外新加 `409 already_running`）。

### GET /api/check/status

```json
{ "running": true, "done": 12, "total": 49, "startedAt": 1764000000000 }
```

### POST /api/meta

添加链接前的预览。服务端抓取，**3 秒总超时**；仅允许 HTTP/HTTPS 公网地址，DNS 解析结果、实际连接与每次重定向均会校验。

```json
// 请求
{ "url": "https://github.com" }
// 200
{ "resolvedUrl": "https://github.com/", "title": "GitHub",
  "description": "GitHub is where people build software.",
  "host": "github.com", "iconUrl": "/icons/...", "iconPath": "icons/..." }
```

抓取失败仍返回 `200`，字段尽量给：`{ "resolvedUrl": "...", "title": null, ... }`，前端回退到手填。

抓到的 favicon 已写入 `data/icons`。把响应里的 `iconPath`（不含前导 `/`）随 `POST /api/links` 一起提交即可持久化该图标；不提交时该文件保持未被引用，可由 `POST /api/icons/purge` 回收。

---

## 5. 分类

### GET /api/admin/categories

仅管理员可用。返回完整两级树，含私有分类与全部链接（结构同 `/api/home` 的 `groups`）。后台分类管理、链接管理、概览统计共用此数据。

### GET /api/admin/links

仅管理员可用。返回扁平链接列表，每条含 `categoryName`（分类自身名称，不含父级前缀）。响应 `{ "items": LinkDTO[] }`。后台链接管理与概览统计使用。

### GET /api/categories

返回过滤后的完整两级树（结构同 `/api/home` 的 `groups`，但不含链接）。供分类管理与选择器使用：

```json
{
  "groups": [
    {
      "id": 1,
      "name": "开发",
      "icon": "Code",
      "iconUrl": null,
      "description": "常用开发技术与平台",
      "sort": 1000,
      "isPrivate": false,
      "links": [],
      "categories": [
        {
          "id": 3,
          "name": "代码托管",
          "icon": "FolderGit",
          "iconUrl": null,
          "description": null,
          "sort": 1000,
          "isPrivate": false,
          "parentId": 1,
          "links": []
        }
      ]
    }
  ]
}
```

### POST /api/categories

```json
{
  "name": "开发",
  "parentId": null,
  "icon": "Code",
  "sort": 1000,
  "isPrivate": false,
  "description": "常用开发技术与平台"
}
```

- `name`: 分类名称（1–64 字符，必填）。
- `parentId`: 父级分类 ID（可空，不选择即为一级分类）。其父级必须是一级分类，否则 `400 bad_request`。
- `icon` / `iconPath`: 图标（支持 emoji、Lucide 图标名、图片 URL 或相对路径，可选）。
- `sort`: 排序值（整数，数字越小越靠前，缺省为 10；排序相同时按添加时间先后排序）。
- `isPrivate`: 是否私有（布尔，默认 `false`）。
- `description`: 分类描述（文本，可选）。

响应 `201`：
```json
{ "id": 1, "name": "开发" }
```

### PATCH /api/categories/{id}

```json
{
  "name": "开发工具",
  "parentId": 1,
  "icon": "Terminal",
  "sort": 1000,
  "isPrivate": false,
  "description": "开发与调试工具"
}
```

可改 `name` / `parentId` / `icon` (`iconPath`) / `sort` / `isPrivate` / `description`。改 `name` 触发其下链接的搜索索引重算（后台任务）。

响应 `200`：
```json
{ "id": 1, "name": "开发工具" }
```

### DELETE /api/categories/{id}

必须指定链接去向：

| 参数 | 行为 |
|---|---|
| `?links=delete` | 分类及其下链接一并删除 |
| `?links=move&moveToCategoryId=4` | 链接移到目标分类，再删分类 |
| 不传 | 分类下（含子分类）有链接时返回 `409 link_exists_in_category`，前端应据此弹出选择框 |

删除一级分类时，其子分类随之删除（同样按上述规则处理这些分类下的链接）。

---

## 6. 健康检测查询

### GET /api/checks

| 参数 | 说明 |
|---|---|
| `status` | `warn` / `dead`，缺省查全部 |
| `categoryId` | 限定分类 |
| `page` / `pageSize` | 分页 |

返回按链接聚合的最新结果：

```json
{ "items": [ { "linkId": 12, "title": "GitHub", "url": "...",
  "categoryName": "代码托管", "status": "dead", "httpStatus": 404,
  "latencyMs": 812, "errorType": "http", "checkedAt": 1764000000000 } ],
  "total": 3 }
```

---

## 7. 设置与令牌

### GET /api/settings

游客可用，只返回公开子集（站点名、描述、亮色/暗色背景、logoUrl、openInNewTab、faviconServiceUrl）。**不得**返回任何 `secret.*`。

### PATCH /api/settings

```json
{ "name": "我的导航", "description": "...", "backgroundLight": "#f4f5f7", "backgroundDark": "#0f1115",
  "openInNewTab": true, "faviconServiceUrl": "https://a.favicon.im/" }
```

logo 通过 `POST /api/links/{id}/icon` 之外单独处理：设置页上传走 `POST /api/settings/logo`（multipart，≤ 1 MB，png/jpeg/webp）。**不接受 SVG。**

### GET /api/settings/fetch

管理员可用，返回当前生效的网络请求与外联参数（未配置时为代码默认值）：

```json
{ "fetch": {
  "htmlUserAgent": "Mozilla/5.0 ...", "iconUserAgent": "Mozilla/5.0 ...",
  "healthUserAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "clientTimeoutMs": 4000, "metaTimeoutMs": 3000, "faviconTimeoutMs": 8000,
  "healthTimeoutMs": 10000, "htmlMaxBytes": 524288, "iconMaxBytes": 1048576,
  "healthConcurrency": 5 } }
```

出站 IP 段、fake-ip 例外、协议白名单与重定向上限属于安全基线，不在此接口暴露。

### PATCH /api/settings/fetch

管理员可用，字段可省略；字符串传 `""` 或数字传 `0` 表示恢复代码默认值。保存后立即生效，无需重启。

```json
{ "metaTimeoutMs": 5000, "htmlUserAgent": "Mozilla/5.0 ...", "healthConcurrency": 3 }
```

范围：超时 `100–120000` 毫秒，字节数 `1024–10485760`，并发数 `1–50`，UA 为单行且不超过 512 字符。响应为 `200` + 与 GET 相同的 `{ "fetch": ... }`。

### POST /api/settings/account

```json
{ "currentPassword": "...", "username": "newname", "newPassword": "..." }
```

`username` / `newPassword` 可省略其一。改密码成功后轮换数据目录下的 `.cookie_key`，**所有旧会话失效**，当前设备通过响应中的新 Cookie 保持登录。

响应 `200`：
```json
{ "username": "newname", "expiresAt": 1764000000000 }
```

仅修改用户名时省略 `expiresAt`；修改密码时返回新会话的到期时间（Unix 毫秒）。

### GET /api/settings/token

```json
{ "enabled": true, "prefix": "nn_ab12", "createdAt": 1764000000000, "lastUsedAt": 1764000000000 }
```

### POST /api/settings/token

生成或轮换，**明文只在此响应出现一次**：

```json
{ "token": "nn_9f2c...", "prefix": "nn_9f2c" }
```

轮换后旧 token 立即失效。

### DELETE /api/settings/token

`204`。吊销后外部调用需重新生成。

---

## 8. 图标上传

### POST /api/links/{id}/icon

`multipart/form-data`，字段 `file`。限制：

- 类型：`image/png`、`image/jpeg`、`image/webp`、`image/x-icon`
- 大小 ≤ 1 MB
- 服务端重算内容哈希命名，不信任客户端文件名

成功返回 `200` + 更新后的完整链接对象，其中 `iconUrl` 为新图标地址，该链接 `icon_source` 置 `upload`。原图标若不再被任何链接、分类或站点 Logo 引用，立即从磁盘删除。

### DELETE /api/links/{id}/icon

`200` + 更新后的链接对象（`iconUrl` 为 `null`，卡片回退首字母占位），同样按引用计数回收文件。

### POST /api/icons/purge

扫描 `data/icons`，删除没有任何行引用的文件。

```json
{ "removed": 12 }
```

### GET /api/favicon/{target}

公开端点，但默认启用防盗链。管理后台「网络请求 → 站点图标 → Favicon 来源白名单」控制可访问域名：请求带 `Referer`/`Origin` 时校验其域名，无来源头时校验请求 Host；白名单为空时仅允许请求 Host 自身。设为 `*` 时允许任意来源。不匹配返回 `403`。判断与客户端 IP 无关，反向代理无需透传真实 IP。Referer 可伪造，不作为身份认证。

根据给定的域名或地址获取 favicon 图标。支持直接携带图片格式后缀（如 `.ico`、`.png`、`.jpg`、`.webp`），例如：
- `/api/favicon/www.baidu.com.ico`
- `/api/favicon/www.baidu.com.png`
- `/api/favicon/github.com`

抓取成功后自动落盘缓存于 `data/icons` 并在 `favicon_cache` 表记录，后续请求直接命中缓存。服务端仅访问 HTTP/HTTPS 公网地址，DNS 解析结果、实际连接与每次重定向均会校验。返回 `200` 及对应 Content-Type，若目标站点不可达、被安全策略拒绝或无可用图标则返回 `404`。

---

## 9. 数据备份

### GET /api/backup/export

`Content-Disposition: attachment; filename="nextnav-backup-20261124.json"`，内容格式见 DATA_MODEL 第 5 节。

### POST /api/backup/import

`multipart/form-data`（字段 `file`）或直接 JSON body，附 `?mode=merge|replace`。

```json
{ "mode": "merge", "categories": { "created": 5, "updated": 2 },
  "links": { "created": 40, "updated": 9 } }
```

校验失败（如 `version` 不支持、`format` 不符）返回 `400 bad_request`，且**不写入任何数据**（先解析校验，再在单个事务里落库）。

---

## 10. 前端调用约定

- TanStack Query 的 key 约定：`['home']`、`['links', params]`、`['categories']`、`['settings']`、`['check-status']`
- 任意请求收到 `401` → 清本地登录态、跳 `/login`
- 收到 `403 csrf_failed` → 提示「会话已失效，请重新登录」
- 添加链接：先 `POST /api/meta` 预览 → 用户确认 → `POST /api/links`；`meta` 失败不阻塞提交