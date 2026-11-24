# NextNav 数据模型

配套 [FEATURES.md](FEATURES.md)。本文件是 schema 的权威定义，改字段先改这里。

---

## 0. 通用约定

| 项 | 约定 |
|---|---|
| 数据库 | SQLite 3，单文件 `data/nextnav.db`，`journal_mode = WAL`，`foreign_keys = ON` |
| 主键 | `INTEGER PRIMARY KEY AUTOINCREMENT`。备份导入时由服务端重新映射 id |
| 时间 | **INTEGER，Unix 毫秒**（UTC）。不用文本时间，避免时区与排序问题 |
| 布尔 | INTEGER 0/1，DDL 带 `CHECK` 约束 |
| 枚举 | TEXT + `CHECK ... IN (...)`，取值在本文档列全 |
| 文本编码 | 全部 UTF-8；比较与匹配前由服务端统一转小写 |
| 删除 | 硬删除。分类删除由接口显式决定连带删除还是移动链接（见 API） |
| 迁移 | 内嵌 `migrations/0001_init.sql` 起，按文件名排序执行，`PRAGMA user_version` 记录版本号 |

---

## 1. 表定义

### 1.1 setting

键值表，存站点级配置。**不要**把密钥类信息放这里（见 `api_token`）。

```sql
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

已定义的 key：

| key | 类型 | 默认 | 说明 |
|---|---|---|---|
| `site.name` | string | `NextNav` | 站点名 |
| `site.description` | string | `""` | 副标题 |
| `site.background` | string | `""` | 背景，CSS 色值或图片路径 |
| `site.logo_path` | string | `""` | 自定义 logo 路径，空表示用文字字标 |
| `link.open_in_new_tab` | bool | `true` | 点击卡片打开方式 |
| `check.interval` | string | 取自环境变量 | 最近一次生效的检测间隔，仅用于展示 |
| `secret.cookie_key` | string | 首次启动生成 | 会话 cookie 的 HMAC 密钥（32 字节随机，hex 存储） |

> `secret.*` 在备份导出时**必须剔除**，否则导出的文件等于泄露会话密钥。

### 1.2 admin

单行表，`CHECK (id = 1)` 从结构上保证只有一个管理员。

```sql
CREATE TABLE admin (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,   -- argon2id，格式 $argon2id$v=19$m=...,t=...,p=...$salt$hash
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

「是否已安装」= `SELECT COUNT(*) FROM admin` 是否为 0。安装向导只在该值为 0 时可用。

### 1.3 api_token

单行表，存哈希而不是明文。明文只在生成时返回一次。

```sql
CREATE TABLE api_token (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash   TEXT    NOT NULL,      -- sha256(明文)，hex
  prefix       TEXT    NOT NULL,      -- 明文前 8 位，仅用于界面展示「nn_ab12…」
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
```

令牌格式：`nn_` + 32 字节随机（base62），约 46 字符。校验时做常量时间比较。

### 1.4 category

两级结构：`parent_id IS NULL` 为一级分类，非空为二级子分类。**服务端必须保证**：

- 父级自身必须是 `parent_id IS NULL`（不支持三级）
- 不能把分类设成自己的父级
- 一级分类**允许直接挂链接**（首页把它当作一个有链接的区块）

```sql
CREATE TABLE category (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  icon_path   TEXT,                                  -- 图标：相对 data/ 的路径、外部 URL、emoji 或图标名，可空
  parent_id   INTEGER REFERENCES category(id) ON DELETE CASCADE,
  sort        INTEGER NOT NULL DEFAULT 0,            -- 权重/排序值，数字越小越靠前
  is_private  INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1)),
  description TEXT,                                  -- 分类描述，可空
  is_sample   INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_category_parent_sort ON category(parent_id, sort);
```

### 1.5 link

```sql
CREATE TABLE link (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  url             TEXT    NOT NULL,
  backup_url      TEXT,
  description     TEXT,
  icon_path       TEXT,
  icon_source     TEXT CHECK (icon_source IN ('upload','fetched','placeholder')),
  sort            INTEGER NOT NULL DEFAULT 0,
  is_private      INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1)),
  is_sample       INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1)),
  click_count     INTEGER NOT NULL DEFAULT 0,
  last_clicked_at INTEGER,
  -- 最近一次检测结果，denormalize 到主表，列表页无需 join
  last_status     TEXT    NOT NULL DEFAULT 'unknown'
                          CHECK (last_status IN ('ok','warn','dead','unknown')),
  last_checked_at INTEGER,
  -- 搜索索引，写入时生成，见第 3 节
  title_norm      TEXT    NOT NULL,
  host            TEXT    NOT NULL,
  pinyin_full     TEXT    NOT NULL DEFAULT '',
  pinyin_short    TEXT    NOT NULL DEFAULT '',
  search_text     TEXT    NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_link_category_sort ON link(category_id, sort);
CREATE INDEX idx_link_search        ON link(search_text);
CREATE INDEX idx_link_status        ON link(last_status);
```

要点：

- **`url` 不做唯一约束**。同一个站点在不同分类下重复收录是合理需求；新增时检测到「同分类 + 同 URL」返回 409 由前端提示，但不强制。
- `icon_source = 'upload'` 时 `icon_path` 必填；`'placeholder'` 表示走前端首字母渲染。
- `last_status` 是缓存值，权威数据在 `link_check`。

### 1.6 link_check

```sql
CREATE TABLE link_check (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     INTEGER NOT NULL REFERENCES link(id) ON DELETE CASCADE,
  ok          INTEGER NOT NULL CHECK (ok IN (0,1)),
  http_status INTEGER,                       -- 无响应时为 NULL
  latency_ms  INTEGER,
  error_type  TEXT CHECK (error_type IN
                ('dns','timeout','tls','http','refused','redirect','other')),
  checked_at  INTEGER NOT NULL
);

CREATE INDEX idx_check_link_time ON link_check(link_id, checked_at DESC);
```

**保留策略**：每次写入后，按 `link_id` 只保留最新 30 行，其余删除。清理在同一个事务里做。

`ok` 与 `last_status` 的映射：

| 情况 | ok | last_status |
|---|---|---|
| 2xx / 3xx 最终落到 2xx | 1 | `ok` |
| 超时、DNS、TLS、连接拒绝 | 0 | `dead` |
| 4xx / 5xx、重定向过多 | 0 | `dead` |
| 请求成功但耗时 > 5s | 1 | `warn` |

> 「失效」与「异常」在 UI 上都是角标，但 `warn` 用黄色、`dead` 用红色（对应 E2）。

---

## 2. 排序（sort）

- 同一作用域内排序：分类的兄弟节点共享 `parent_id`，链接共享 `category_id`。
- 新增时 `sort` 取该作用域 `MAX(sort) + 1000`。
- 拖拽结束后，前端提交**该作用域完整的有序 id 数组**，服务端在一个事务里按序重写为 `1000, 2000, 3000...`。
- 不做「中间插入取平均」的间隙算法——作用域内元素数量是几十到几百，整体重写更简单且不会累积浮点误差。

---

## 3. 搜索索引

写入（新增 / 编辑）时由服务端重新计算以下字段，四者一起更新：

| 字段 | 生成规则 | 例子（标题「微信」域名 `weixin.qq.com`） |
|---|---|---|
| `title_norm` | 标题转小写、去首尾空格 | `微信` |
| `host` | URL 的 host，小写，去 `www.` | `weixin.qq.com` |
| `pinyin_full` | 标题全拼，音节间以空格分隔 | `wei xin` |
| `pinyin_short` | 标题首字母连写 | `wx` |
| `search_text` | 上四者 + 原始描述 + 分类名，全部小写，空格拼接 | `微信 weixin.qq.com wei xin wx 即时通讯 社交…` |

查询流程：

1. SQL 粗筛：`search_text LIKE '%' || ? || '%'`（查询词同样转小写、并同时生成拼音变体一起 OR）
2. Go 内精排：按 B4 的权重打分——标题前缀 > 标题包含 > 域名 > 描述 > 拼音；同分按 `click_count` 降序

数据量在千级以内，一律取粗筛结果全量精排，不做 SQL 分页后再排序（会错序）。

> `search_text` 含分类名，所以分类改名时要批量重算其下链接的索引——用一个「下载重算」的后台任务完成，不阻塞改名的响应。

---

## 4. 图标存储

```
data/
  nextnav.db
  icons/
    ab/cd/abcdef0123456789.webp     ← 文件名 = 内容 sha256 前 16 位
```

- 路径规则：`icons/<hash前2位>/<hash第3-4位>/<hash16>.<ext>`，避免单目录文件过多。
- 同内容永远同路径，因此可以 `Cache-Control: public, max-age=31536000, immutable`。
- 允许类型：`png` / `jpeg` / `webp` / `ico`。**禁止 SVG**（可内嵌脚本，作为图片返回仍有风险）。
- 上传限制：单文件 ≤ 1 MB。抓取 favicon 同样走此限制，超限按失败处理。
- `icon_path` 存相对 `data/` 的路径（如 `icons/ab/cd/....webp`），对外 URL 为 `/icons/ab/cd/....webp`。

---

## 5. 备份文件格式

`GET /api/backup/export` 下载的 JSON：

```json
{
  "format": "nextnav-backup",
  "version": 1,
  "exportedAt": 1764000000000,
  "settings": { "site.name": "NextNav", "site.description": "" },
  "categories": [
    { "ref": "c1", "name": "开发", "parentRef": null, "sort": 1000, "isPrivate": false, "iconPath": null },
    { "ref": "c2", "name": "代码托管", "parentRef": "c1", "sort": 1000, "isPrivate": false, "iconPath": null }
  ],
  "links": [
    { "categoryRef": "c2", "title": "GitHub", "url": "https://github.com",
      "backupUrl": null, "description": "代码托管", "iconPath": null,
      "sort": 1000, "isPrivate": false, "clickCount": 0 }
  ]
}
```

约定：

- 分类用 `ref`/`parentRef` 表达层级，**不导出数据库 id**，避免导入到另一实例时冲突。
- `settings` 中剔除所有 `secret.*`，剔除 `site.logo_path` 指向的自定义 logo（文件不在 JSON 里，导入后为空，回退文字字标）。
- 不导出 `link_check`、`api_token`、`admin`、`is_sample`（导入的数据一律视为用户数据，`is_sample = 0`）。
- 导入 `merge` 的匹配规则：分类按「`name` + 父级」匹配，链接按「`url` + 所属分类」匹配；匹配到则更新，未匹配则新建。`replace` 先清空分类与链接再全量写入。

---

## 6. 初始数据

安装向导成功后写入第 8 节所列示例数据，全部 `is_sample = 1`。

- 分类与链接同一事务写入，任一失败整体回滚。
- 示例数据写入后立即返回，**图标抓取异步进行**，不阻塞安装完成。
- 用户对任一示例条目执行编辑操作时，服务端把该条 `is_sample` 置 0（分类改动时连同其子分类一并置 0）。

---

## 7. 迁移清单

| 版本 | 内容 |
|---|---|
| 0001_init | 上述全部表、索引、`PRAGMA user_version = 1` |

后续变更一律新增 `000N_*.sql`，不改历史文件。启动时在事务内逐版本执行，失败则回滚并拒绝启动（打印到 stderr）。