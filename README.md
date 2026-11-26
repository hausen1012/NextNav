# NextNav

自托管的个人网站导航站。单用户管理、公开可读、开箱即用。

后端 Go（单二进制，`go:embed` 内嵌前端）+ SQLite，前端 React + Tailwind。

## 开发

需要 Go 1.23+ 与 Node 22+。

最省事：一条命令搞定。

```powershell
.\dev.ps1              # 开发模式：Go 后端 + Vite 热更新
.\dev.ps1 build        # 构建并在单端口运行（前端内嵌进二进制）
.\dev.ps1 test         # 跑全部测试
```

```bash
./dev.sh               # Git Bash / macOS / Linux 等价物
./dev.sh build
./dev.sh test
```

首次运行会自动 `npm ci`。默认后端 `:8787`、前端 `:5173`，打开 http://localhost:5173 。
可用环境变量覆盖：`PORT`、`WEB_PORT`、`DATA_DIR`、`CHECK_INTERVAL`。

> Windows 上 PowerShell 必须能加载 `dev.ps1`。若提示"禁止运行脚本"，用
> `powershell -ExecutionPolicy Bypass -File .\dev.ps1` 执行一次即可。

### 手动启动（调试单个进程时）

```bash
# 后端
cd server && go run ./cmd/nextnav

# 前端（另一个终端）
cd web && npm run dev
```

## 构建

```bash
make build      # 前端构建 → 内嵌 → bin/nextnav
make test       # Go + 前端测试
```

## 部署

### Docker Compose 本地构建

```bash
cp .env.example .env   # 可选，调整端口与检测频率
docker compose up -d --build
```

### 预构建镜像运行（GHCR / Docker Hub）

```bash
# 使用 GitHub Container Registry（测试版镜像）
docker run -d \
  --name nextnav \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  ghcr.io/<owner>/nextnav:beta
```

数据（SQLite 与上传图标）保存在 `./data`，日志只写 stdout，由 Docker 日志驱动收集。

反向代理与 HTTPS 不在本项目范围内；需要的话在容器前面自行加一层。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787`（容器内 `3000`） | 监听端口 |
| `DATA_DIR` | `./data` | 数据目录 |
| `CHECK_INTERVAL` | `1d` | 链接检测频率，支持 `6h` / `1d` / `off` |
| `COOKIE_SECURE` | `false` | HTTPS 部署时设为 `true` |
| `ADMIN_USERNAME` | `admin` | 首次启动初始化的管理员用户名（1–32 字符） |
| `ADMIN_PASSWORD` | `admin123` | 首次启动初始化的管理员密码（至少 8 位） |
| `IMPORT_SAMPLE_DATA` | `false` | 首次启动是否导入示例数据，设为 `true` 开启 |
| `FAVICON_ALLOWED_DOMAINS` | 空 | Favicon 防盗链 Referer 白名单，逗号分隔；`example.com` 仅精确匹配，`*.example.com` 匹配主域及子域，`*` 允许任意来源；内网 IP 始终允许 |

## 文档

- [docs/FEATURES.md](docs/FEATURES.md) — 功能规格、优先级、里程碑
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — 表结构、排序、搜索索引、备份格式
- [docs/API.md](docs/API.md) — API 契约与鉴权规则

## 功能状态

### 已实现核心功能

- **初始化与账号管理**：启动时通过环境变量初始化管理员账号与预置演示数据、会话认证与密码修改、长效 API 访问令牌（Bearer Token）生成与撤回。
- **公开前台展示**：两级分类树排版、链接卡片展示、卡片右键/长按快捷菜单（打开/打开备用/复制/二维码/编辑/删除）、离线二维码生成与 PNG 下载、分类一键全部打开、暗色模式切换、移动端响应式布局。
- **图标管理**：网页元信息（标题/描述/favicon）自动抓取，抓取仅访问公网地址并校验 DNS、连接与重定向；链接图标支持手动上传（PNG/JPEG/WebP/ICO，≤ 1 MB）与移除，未引用文件自动回收。
- **管理控制台（`/admin`）**：概览看板、两级分类管理（增/删/改/私有/描述/自定义排序）、链接管理（增/删/改/分类归属/筛选/分页/批量多选/批量移动/批量删除）、站点设置（名称/描述/背景/Logo/新标签打开）、系统维护（全站数据 JSON 导出与合并/覆盖导入、图标缓存清理）。
- **统一服务交付**：Go 后端内嵌前端产物（`go:embed`）、单二进制运行、SQLite 零配置存储、Docker 容器化支持。

### 规划中增强功能

- 分类一键全部打开（PWA 离线）与失效通知推送（M4）