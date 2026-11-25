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
| GET | `/api/settings` | 公开 | 站点公开设置 |
| PATCH | `/api/settings` | 管理员 | 修改站点设置 |
| POST | `/api/settings/account` | 管理员 | 修改管理员用户名与密码 |
| GET | `/api/tokens` | 管理员 | 获取当前 API Token 状态与前缀 |
| POST | `/api/tokens` | 管理员 | 生成新 API Token（仅返回一次完整明文） |
| DELETE | `/api/tokens` | 管理员 | 撤回 API Token |
| GET | `/api/backup/export` | 管理员 | 导出全站数据 JSON 备份 |
| POST | `/api/backup/import` | 管理员 | 导入全站数据（支持 merge / overwrite） |
| POST | `/api/sample/clear` | 管理员 | 清空预置示例数据 |
| GET | `/icons/*` | 公开 | 图标静态资源托管 |

### 1.2 规划中扩展端点

| 方法 | 路径 | 身份 | 说明 |
|---|---|---|---|
| GET | `/api/links` | 任意 | 独立链接列表 / 服务端高级搜索 |
| GET | `/api/links/{id}` | 任意 | 链接详情 |
| POST | `/api/links/{id}/check` | 管理员 | 单条健康检测 |
| POST | `/api/links/check-all` | 管理员 | 全站健康检测 |
| GET | `/api/check/status` | 管理员 | 检测进度查询 |
| POST | `/api/meta` | 管理员 | 抓取 URL 元信息预览 |
| GET | `/api/checks` | 管理员 | 检测记录查询（失效清单） |
| POST | `/api/links/{id}/icon` | 管理员 | 上传自定义图标 |

非 `/api` 的静态路径：`/icons/*`（图标，长缓存）、`/manifest.webmanifest`、`/sw.js`；其余路径一律返回 SPA 的 `index.html`。

---

## 2. 认证

### POST /api/login

```json
{ "username": "admin", "password": "..." }
```

- 成功：`200` + `Set-Cookie: nn_session=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`（HTTPS 下加 `Secure`）
- 失败：`401 bad_credentials`
- 限流：同一 IP 10 次失败 / 10 分钟 → `429 rate_limited`

### POST /api/logout

清除 cookie，`204`。

### GET /api/me

```json
{ "auth": "admin", "authMethod": "cookie", "username": "admin" }
// 游客
{ "auth": "guest" }
```

---

## 3. 首页与读取

### GET /api/home

一次请求拿全首页数据，**不要在客户端为每个分类各发一次请求**。

```json
{
  "site": {
    "name": "NextNav",
    "description": "",
    "background": "",
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
  "sort": 1000,
  "isPrivate": false
}
```

- `categoryId` 与 `url` 为必填项；`url` 必须为 http/https。
- `title` 为空时服务端使用 host 兜底（最多 128 字符）。
- `backupUrl`、`description`、`sort`、`isPrivate` 为可选项。
- 同分类下 URL 重复 → `409 duplicate_link`。
- 响应 `201` + 完整链接对象。

### PATCH /api/links/{id}

只传需要改的字段（`categoryId` / `title` / `url` / `backupUrl` / `description` / `sort` / `isPrivate`）。任何字段变化都会重算搜索索引；用户编辑后该条 `is_sample` 置 0。
响应 `200` + 完整更新后的链接对象。

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

### POST /api/links/{id}/check

同步执行单条检测，`200`：

```json
{ "status": "dead", "httpStatus": 404, "latencyMs": 812,
  "errorType": "http", "checkedAt": 1764000000000 }
```

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

添加链接前的预览。服务端抓取，**3 秒超时**。

```json
// 请求
{ "url": "https://github.com" }
// 200
{ "resolvedUrl": "https://github.com/", "title": "GitHub",
  "description": "GitHub is where people build software.",
  "host": "github.com", "iconUrl": "/icons/..." }
```

抓取失败仍返回 `200`，字段尽量给：`{ "resolvedUrl": "...", "title": null, ... }`，前端回退到手填。

---

## 5. 分类

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

可改 `name` / `parentId` / `icon` (`iconPath`) / `sort` / `isPrivate` / `description`。改 `name` 触发其下链接的搜索索引重算（后台任务）。用户编辑后 `is_sample` 置 0，并连同子分类。

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

游客可用，只返回公开子集（站点名、描述、背景、logoUrl、openInNewTab）。**不得**返回任何 `secret.*`。

### PATCH /api/settings

```json
{ "name": "我的导航", "description": "...", "background": "#0f1115",
  "openInNewTab": true }
```

logo 通过 `POST /api/links/{id}/icon` 之外单独处理：设置页上传走 `POST /api/settings/logo`（multipart，≤ 1 MB，png/jpeg/webp）。**不接受 SVG。**

### POST /api/settings/account

```json
{ "currentPassword": "...", "username": "newname", "newPassword": "..." }
```

`username` / `newPassword` 可省略其一。改密码成功后**作废现有会话**（换 cookie 密钥会导致所有已登录设备下线，属于预期行为）。

响应 `200`：
```json
{ "username": "newname" }
```

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

成功返回 `{ "iconUrl": "/icons/ab/cd/....webp" }`，并把该链接 `icon_source` 置 `upload`。

---

## 9. 示例数据与备份

### POST /api/sample/clear

```json
{ "deletedCategories": 11, "deletedLinks": 49 }
```

只删 `is_sample = 1` 的记录。若用户编辑过其中某条，该条已置 0，不会被删。

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