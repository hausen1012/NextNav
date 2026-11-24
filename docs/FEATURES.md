# NextNav 功能规格 v0.3

> 定位：**个人自托管网站导航站**。单用户管理、公开可读、跨设备访问。
> 参考 [OneNav](https://github.com/helloxz/onenav)，但砍掉多用户 / 访客投稿 / 插件市场 / AI 检索 / 外部导入，
> 把精力放在 **搜索体验**、**链接健康度**、**链接增强** 三件事上。
> 本文档只定义产品功能与数据；Docker 部署仅覆盖打镜像与 compose 启动，不含反向代理与证书配置。

---

## 0. 决策记录

| # | 决策 | 结论 |
|---|---|---|
| 1 | 产品名 | **NextNav**。暂不做图形 logo，页头用文字字标渲染；管理员可在设置页改站点名、描述、背景，并上传自己的 logo |
| 2 | 用户模型 | 单用户。用户名 + 密码，无注册入口、无角色。登录 = 管理员。账号在首次安装向导中创建 |
| 3 | 可见性 | **公开可读**：未登录可浏览公开分类与链接。**默认全部公开，私有需手动勾选**；`is_private` 内容仅登录可见 |
| 4 | 技术栈 | **Go 后端 + React 前端**：Go 单二进制（`go:embed` 内嵌前端构建产物）+ SQLite；前端 Vite + React + Tailwind + shadcn/ui。**首要约束是低内存占用** |
| 5 | 渲染方式 | **纯 SPA**（前端路由 + JSON API），不做 SSR/SEO。首屏依赖 JS，靠控制包体与内联关键样式弥补 |
| 6 | 前台/后台 | 同一套界面。"编辑模式"开关，登录后可开可关 |
| 7 | 移动端 | 与桌面同一套响应式布局，不做独立手机后台 |
| 8 | AI | **不做**。检索只走关键词 + 拼音，因此搜索质量按 P0 要求打磨 |
| 9 | 外部导入 | **不做**。历史链接通过备份导入（F2）或 API（F3）迁移 |
| 10 | 部署 | **Docker + docker compose**：单服务 + 数据卷；反向代理与 HTTPS 由使用者自行解决 |

---

## 1. 核心场景（用来检验功能是否够用）

1. 在手机上打开站点，搜「设计」，点进 Figma。
2. 忘了某个站叫什么：「webp」或拼音敲进去，靠标题/描述/拼音命中，无需选分类。
3. 收藏的某个站挂了：卡片出现红色角标，进编辑模式按「失效」筛选，修地址或删掉。
4. 家里 NAS：主链接用局域网 IP，出门用备用域名——同一个收藏，两个入口。
5. 加新收藏：登录 → 点悬浮「+」→ 粘贴 URL → 标题/图标/描述自动带出 → 保存，全程 < 10 秒。
6. 朋友偶尔访问：不登录也能看公开内容，看不到你的私有收藏。

---

## 2. 范围

**做**：分类树、链接卡片、关键词+拼音搜索、健康检测、备用链接、私有链接、二维码、拖拽排序、图标抓取与缓存、暗色模式、备份导出/导入、统一 REST API、Docker 部署。

**不做（Non-goals，明确划线）**：
- 多用户、注册、邀请码、分类权限
- 访客投稿 / 审核流程
- AI 检索 / 语义搜索（唯一检索路径是关键词与拼音）
- 浏览器书签 HTML 导入（不做外部 HTML 导入）
- 反向代理、HTTPS 证书、编排多服务、运维手册（部署只做 Docker + compose）
- 主题市场、插件系统、一键在线升级
- 计费、统计报表、社交功能

---

## 3. 数据模型

```
setting        key, value                       # 站点名、logo 等
admin          id, username, password_hash, created_at  # 单行，首次安装向导写入
category       id, name, icon, parent_id, sort, is_private, description, is_sample, created_at
link           id, category_id, title, url, backup_url, description,
               icon_path, sort, is_private, is_sample, click_count, last_clicked_at,
               created_at, updated_at
link_check     id, link_id, ok, http_status, latency_ms, error_type, checked_at
```

要点：
- `category.parent_id` 支持两级分类：`parent_id = NULL` 为一级分类，非空为二级子分类。允许一级分类直接挂链接（无子分类）。
- `icon_path` 存本地路径；抓取失败时前端用「域名首字母 + 域名哈希色」占位，不依赖外网。
- `link_check` 保留最近 30 次/链接，定时清理。
- 搜索用的 `search_text`（标题+描述+域名+拼音全拼+拼音首字母）在写入时生成并落库，供 LIKE 查询。

---

## 4. 功能清单

优先级：**P0** = MVP 必须有；**P1** = 第二版；**P2** = 有余力再做。

### A. 浏览与展示

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| A1 | 分类树 | P0 | 一级分类分块展示，二级分类作为块内小节或 tab；分类的排序值落库，刷新后顺序不变（拖拽交互本身在 D3，P1） |
| A2 | 链接卡片 | P0 | 图标 + 名称 +（可选）描述；悬停微动效；点击整卡打开主链接（默认新标签页，可在设置页改为当前页） |
| A3 | 响应式栅格 | P0 | ≥1280 6 列 / 768–1280 4 列 / 480–768 3 列 / <480 2 列；无横向滚动 |
| A4 | 暗色模式 | P0 | 跟随系统 + 手动切换，选择存 localStorage；首屏无闪烁：在 `index.html` 里内联一段同步脚本先写 `data-theme`，再接 React 渲染 |
| A5 | 公开 / 私有 | P0 | 未登录可看公开内容。**私有分类整块不渲染**（其下所有链接一并隐藏，无论链接自身标记），分类标题、二级分类、计数都不出现；**私有链接只隐藏该条**，所在分类照常展示。两者均不出现在列表、搜索结果、API 响应中 |
| A6 | 图标 | P0 | 优先级：手动上传 > 抓取的 favicon > 首字母占位。抓取结果缓存到本地目录，不为每次访问回源 |
| A7 | 站点信息 | P1 | 站点名默认 **NextNav**；**本期不做默认 logo**，页头直接排文字字标。管理员可修改站点名、描述、背景（图片或纯色），并可选上传自己的 logo；未设置时回退到内置默认值 |

### B. 搜索（本项目的核心体验）

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| B1 | 即时搜索 | P0 | 输入即过滤（debounce 200ms），匹配标题/域名/描述/分类名/拼音。`/` 或 `Ctrl+K` 聚焦，↑↓ 选择，Enter 打开，Esc 清空 |
| B2 | 搜索范围与结果 | P0 | 默认全站搜索，结果按分类归类展示；空结果提示「换个关键词或检查分类」；私有内容对未登录访问者完全不出现（见 A5），不做「请登录查看」的占位 |
| B3 | 拼音搜索 | P0 | 中文标题支持全拼与首字母（`weixin` / `wx` / `wei xin` 都能命中）；写入时生成索引，查询时同样转换 |
| B4 | 排序策略 | P1 | 匹配权重：标题前缀 > 标题包含 > 域名 > 描述 > 拼音；同权重按点击热度 |
| B5 | 搜索热度 | P2 | 记录搜索词；无结果的关键词在编辑模式下提示「添加为收藏」，预填搜索词 |

### C. 管理

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| C1 | 首次安装向导 | P0 | 首次访问（无管理员记录时）跳转 `/setup`：页面填写用户名 + 密码（两次输入），提交后建号并自动登录；安装完成后该路由永久关闭（再访问重定向首页）。密码服务端 hash（argon2/bcrypt），会话 cookie 30 天（HttpOnly/Secure/SameSite） |
| C2 | 登录 | P0 | 用户名 + 密码登录；连续失败限流（10 次/10 分钟） |
| C3 | 编辑模式 | P0 | 登录后首页出现「编辑」开关。开启后卡片显示 编辑/删除/拖拽手柄，分类可增删改；关闭即纯浏览态。不做独立后台页面（设置页除外） |
| C4 | 快速添加 | P0 | 粘贴 URL → 服务端抓取 `<title>`、meta description、favicon，3s 超时；失败落回手填。键盘 Esc 取消 |
| C5 | 分类管理 | P0 | 新建 / 改名 / 换图标 / 排序 / 私有标记 / 删除（删除时提示链接去向：一起删 or 移到未分类） |
| C6 | 批量操作 | P1 | 多选后批量删除 / 移动分类 / 检测 |
| C7 | 设置页 | P1 | 站点名、描述、背景、上传自定义 logo（可选）、默认打开方式（当前页/新标签）、修改用户名/密码、备份导出、清空示例数据 |
| C8 | 预置演示数据 | P1 | 安装完成后写入预置一级分类、二级分类与大厂站点链接（见第 8 节），让首次进来就有内容可看。设置页提供「清空示例数据」，只删标记为 `is_sample` 的记录，不影响用户自己添加的内容 |

### D. 链接增强

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| D1 | 备用链接 | P1 | `backup_url` 字段。卡片右键菜单（长按）提供：打开 / 打开备用链接 / 复制 / 二维码 / 编辑 / 删除 |
| D2 | 二维码 | P1 | 前端生成（不依赖第三方服务），可下载 PNG |
| D3 | 拖拽排序 | P1 | dnd-kit，卡片与分类都支持；仅编辑模式下可拖 |
| D4 | 标签 | P2 | 一个链接可挂多个标签，与分类并存，用于跨分类聚合 |
| D5 | 点击统计 | P2 | click_count / last_clicked_at；编辑模式下按热度排序 |

### E. 健康检测

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| E1 | 定时检测 | P1 | 频率由环境变量 `CHECK_INTERVAL` 设置（安装/启动时生效，**默认每日一次**；支持如 `6h`、`1d`、`off` 关闭）。先 HEAD 后 GET 降级；超时 10s；最多跟随 5 次重定向；记录状态码、耗时、错误类型（DNS / TIMEOUT / TLS / HTTP / REFUSED） |
| E2 | 状态展示 | P1 | 仅异常时卡片显示角标（失效=红、超时/异常=黄）；正常不打扰 |
| E3 | 手动检测 | P1 | 单条「重新检测」+ 全站「立即检测」，带进度反馈；并发限制（如 5）避免打爆业务站 |
| E4 | 失效清单 | P1 | 编辑模式下的筛选视图，按状态/分类筛选，可一键删除或编辑 |
| E5 | 通知 | P2 | 失效汇总推送到邮件 / Telegram / Webhook |

### F. 交付与数据

| ID | 功能 | 优先级 | 说明与验收 |
|---|---|---|---|
| F1 | Docker 部署 | P0 | 多阶段 Dockerfile（Node 构建前端 → Go 编译内嵌 → 极小运行镜像）+ `docker-compose.yml`，单服务；宿主机端口可配（默认 3000）；`/app/data` 卷持久化 SQLite 与上传图标；**应用日志只写 stdout/stderr，不落盘**，交给 Docker 日志驱动；容器内只有 **一个 Go 进程**（检测定时器是 goroutine，不是独立进程），无外部数据库 |
| F2 | 备份/迁移 | P1 | 一键导出 JSON（设置+分类+链接），导入支持「合并 / 覆盖」。这是迁移历史链接数据的推荐路径 |
| F3 | 统一 API | P1 | 只有一套 `/api/*`，每个资源一套 handler，前端与外部脚本走同一组端点。认证在中间件统一处理，得出三种身份之一：<br>· `Authorization: Bearer <token>` → 管理员（token）<br>· 有效 cookie → 管理员（会话）<br>· 都没有 → 游客<br>读接口：管理员返回全部，游客只返回公开内容。写接口：游客 401；**CSRF 同源校验只对「cookie 身份 + 写操作」生效**——token 是显式携带的凭证，浏览器不会自动附带，无需校验。中间件把 `authMethod` 放入请求 context，handler 不必自己判断来源。<br>校验逻辑集中在 service 层（标题非空、URL 合法、分类存在等），网页与插件写入结果一致。 |
| F4 | PWA | P2 | manifest + service worker 缓存静态资源；可添加到主屏；离线可看已缓存首页 |
| F5 | 一键打开 | P2 | 「全部打开」某个分类下的所有链接（有确认，避免炸标签页） |

---

## 5. 技术方案（对应决策 #4）

| 层 | 选择 | 理由 |
|---|---|---|
| 后端 | Go（net/http + chi 或 stdlib 路由） | 单个静态二进制，常驻内存约 20–40 MB；比 Node 常驻进程轻一个数量级 |
| 内嵌资源 | `go:embed` 把前端 `dist/` 打进二进制 | 部署只有一个文件 + 一个数据目录，没有静态服务器 |
| 数据库 | SQLite（`modernc.org/sqlite` 纯 Go 驱动，无需 CGO；或 mattn/go-sqlite3） | 单文件、零运维；跨平台交叉编译时纯 Go 驱动更省事 |
| 迁移 | 内嵌 SQL 迁移文件（如 goose / golang-migrate 的内嵌模式） | 二进制自带 schema 版本，启动自动迁移 |
| 前端 | Vite + React + TypeScript + Tailwind + shadcn/ui | 构建产物小、无 SSR 运行时；shadcn 组件按需复制进仓库 |
| 前端状态/数据 | TanStack Query + React Router | 缓存、失效、乐观更新现成；不引入重量级全局 store |
| 拖拽 | dnd-kit | 轻量、键盘可访问 |
| 认证 | 统一认证中间件：Bearer token 或 cookie，请求 context 记录认证方式 | 一套路由服务前端与插件；CSRF 只对 cookie 写操作校验，token 天然免疫 |
| 密码 | argon2id（golang.org/x/crypto/argon2） | 标准库生态内即可实现，无需外部依赖 |
| 拼音 | 后端用 Go 拼音库在写入时生成索引，查询时同样转换 | 中文标题可搜全拼与首字母；词典不进前端包体 |
| 定时任务 | 进程内 goroutine ticker + 数据库锁标记 | 单实例够用；间隔读 `CHECK_INTERVAL` |
| 图标 | 服务端抓取 + 本地存储 | 避免前端每次请求第三方 |
| 部署 | 多阶段 Dockerfile：Node 构建前端 → Go 编译 → 极小运行镜像（distroless/scratch + CA 证书） | 最终镜像约 20–30 MB；**前端产物已 `go:embed` 进二进制，服务端是唯一入口**，静态资源与 `/api` 都由同一个 Go 服务提供，生产反代只需一条规则 |
| 测试 | Go `testing`（后端纯逻辑）+ Vitest（前端组件） | 重点覆盖：搜索匹配与排序、拼音索引、健康检测错误判定、导入合并、种子数据 |

---

## 6. 里程碑

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| M0 骨架 | 仓库初始化（Go 服务 + 前端两个目录）、DB schema + 迁移、安装向导、登录、Dockerfile + compose | `npm run dev`（Vite 只代理 `/api` 到 Go）与 `docker compose up`（单一端口全包）都走完安装向导并登录进首页 |
| M1 可用 | A1–A6 + B1–B3 + C3–C5 + C8（C1/C2 已在 M0 完成） | 完成安装后首页即有预置演示内容；能自行录入 20 个链接，完整浏览、拼音搜索，手机可用，未登录可读公开内容 |
| M2 增强 | D1–D3 + B4 + C6–C7 + F2–F3 | 备用链接/二维码/拖拽/备份导入/API 全部可用 |
| M3 健康 | E1–E4 | 检测能正确标红失效站，可筛选可手动重测 |
| M4 打磨 | F4–F5、E5、性能与动效 | Lighthouse 移动端 ≥ 90；首屏 JS（gzip 后）< 200 KB；服务端常驻内存 < 80 MB |

---

## 7. 已确认 / 待补充

**已确认**
1. 可见性：公开可读，私有内容登录可见；**分类/链接默认公开，私有手动勾选**。
2. 不做 AI 检索；搜索靠关键词 + 拼音。
3. 不做浏览器书签 HTML 外部导入；迁移走 JSON 备份 / API。
4. 需要 Docker + docker compose 部署，数据通过卷持久化，日志只写 stdout。
5. 私有语义：分类私有 → 整块不显示；链接私有 → 只隐藏该条。
6. 健康检测频率由环境变量 `CHECK_INTERVAL` 决定，默认每天一次。
7. 站点名为 NextNav，本期不做图形 logo，页头直接排文字字标；管理员可在设置页修改站点名/描述/背景，并可选上传自己的 logo。
8. 安装完成后预置演示一级分类、二级分类与大厂站点（见第 8 节）；提供「清空示例数据」按钮。
9. 技术栈：Go（`go:embed` 内嵌前端）+ SQLite，前端 React + shadcn/ui；以**低内存占用**为首要约束。纯 SPA，不做 SSR。
10. API 统一为 `/api`：中间件按 Bearer token 或 cookie 判定身份（游客只读公开内容），写操作仅对 cookie 身份做 CSRF 同源校验。

---

## 8. 附录：预置演示数据

安装向导完成后自动写入。所有记录标 `is_sample = 1`，用于「清空示例数据」。

层级：**一级分类（parent_id = NULL）→ 二级分类 → 链接**。一级分类本身可挂链接或作为首页的一个区块。

### 8.1 结构总览

| 一级分类 | 二级分类 | 链接数 |
|---|---|---|
| 搜索 | 搜索引擎 | 5 |
| 开发 | 代码托管 / 云服务 / 开发者资源 | 15 |
| 设计 | 设计工具 / 图片素材 / 字体图标 | 11 |
| 效率 | 办公协作 / 笔记与文档 | 11 |
| 资讯 | 科技媒体 / 社区问答 | 7 |

合计 5 个一级分类、11 个二级分类、49 条链接。

### 8.2 详细清单

**搜索 · 搜索引擎**

| 名称 | URL | 描述 |
|---|---|---|
| Google | https://www.google.com | 全球搜索 |
| Bing | https://www.bing.com | 微软搜索 |
| 百度 | https://www.baidu.com | 中文搜索 |
| DuckDuckGo | https://duckduckgo.com | 无追踪搜索 |
| 搜狗 | https://www.sogou.com | 中文搜索与输入法 |

**开发 · 代码托管**

| 名称 | URL | 描述 |
|---|---|---|
| GitHub | https://github.com | 微软旗下代码托管平台 |
| GitLab | https://gitlab.com | DevOps 平台 |
| Gitee | https://gitee.com | 国内代码托管 |
| Bitbucket | https://bitbucket.org | Atlassian 代码托管 |

**开发 · 云服务**

| 名称 | URL | 描述 |
|---|---|---|
| AWS | https://aws.amazon.com | 亚马逊云 |
| Microsoft Azure | https://azure.microsoft.com | 微软云 |
| Google Cloud | https://cloud.google.com | 谷歌云 |
| 阿里云 | https://www.aliyun.com | 阿里云 |
| 腾讯云 | https://cloud.tencent.com | 腾讯云 |
| Cloudflare | https://www.cloudflare.com | CDN 与 DNS |
| Vercel | https://vercel.com | 前端托管 |
| Netlify | https://www.netlify.com | 前端托管 |

**开发 · 开发者资源**

| 名称 | URL | 描述 |
|---|---|---|
| MDN | https://developer.mozilla.org | Web 技术文档 |
| Stack Overflow | https://stackoverflow.com | 开发者问答 |
| Docker Hub | https://hub.docker.com | 容器镜像仓库 |

**设计 · 设计工具**

| 名称 | URL | 描述 |
|---|---|---|
| Figma | https://www.figma.com | 协作式界面设计 |
| Adobe Creative Cloud | https://www.adobe.com/creativecloud | Adobe 全家桶 |
| Canva | https://www.canva.com | 在线平面设计 |
| Sketch | https://www.sketch.com | macOS 界面设计 |
| 即时设计 | https://js.design | 国产在线设计工具 |

**设计 · 图片素材**

| 名称 | URL | 描述 |
|---|---|---|
| Unsplash | https://unsplash.com | 免费高质量图片 |
| Pexels | https://www.pexels.com | 免费图片与视频 |
| Pixabay | https://pixabay.com | 免费图片与插画 |

**设计 · 字体图标**

| 名称 | URL | 描述 |
|---|---|---|
| Google Fonts | https://fonts.google.com | 免费字体库 |
| Font Awesome | https://fontawesome.com | 图标库 |
| Iconfont | https://www.iconfont.cn | 阿里巴巴图标库 |

**效率 · 办公协作**

| 名称 | URL | 描述 |
|---|---|---|
| Google Workspace | https://workspace.google.com | 谷歌办公套件 |
| Microsoft 365 | https://www.microsoft.com/microsoft-365 | 微软办公套件 |
| Slack | https://slack.com | 团队沟通 |
| 飞书 | https://www.feishu.cn | 字节跳动办公协作 |
| 钉钉 | https://www.dingtalk.com | 阿里办公协作 |
| Zoom | https://zoom.us | 视频会议 |

**效率 · 笔记与文档**

| 名称 | URL | 描述 |
|---|---|---|
| Notion | https://www.notion.so | 笔记与知识库 |
| Obsidian | https://obsidian.md | 本地 Markdown 笔记 |
| 语雀 | https://www.yuque.com | 阿里知识库 |
| Dropbox | https://www.dropbox.com | 云盘 |
| Google Drive | https://drive.google.com | 谷歌云盘 |

**资讯 · 科技媒体**

| 名称 | URL | 描述 |
|---|---|---|
| The Verge | https://www.theverge.com | 科技媒体 |
| TechCrunch | https://techcrunch.com | 创业与科技新闻 |
| Hacker News | https://news.ycombinator.com | 技术社区新闻 |
| 少数派 | https://sspai.com | 数字生活媒体 |
| 掘金 | https://juejin.cn | 开发者社区 |

**资讯 · 社区问答**

| 名称 | URL | 描述 |
|---|---|---|
| Reddit | https://www.reddit.com | 综合社区 |
| 知乎 | https://www.zhihu.com | 中文问答 |

### 8.3 实现约定

- 预置数据写成一份种子文件（`seed/sample.json` 或等效 TS 模块），与用户数据共用同一套 schema，只是额外打 `is_sample` 标记。
- 图标同样走 A6 的抓取流程；离线环境下全部回退到首字母占位，不阻塞安装。
- 「清空示例数据」先询问再删，且只删 `is_sample = 1`；若用户编辑过某条示例，编辑动作应清除该标记（视为用户自己的内容，不再被清理）。
- 示例链接的字号与排版要和真实数据一致，**不做特殊视觉标记**——它的目的是让首页「看起来正常」，而不是展示 demo 横幅。
