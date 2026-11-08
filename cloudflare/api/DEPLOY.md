# 热点雷达云端 API 部署指引（Cloudflare Worker + D1）

账号、会话、对话室、管理员统计都跑在独立 Worker `hot-radar-api` 上，数据存放在 D1 数据库 `hot-radar`（表名统一 `hr_` 前缀）。前端仍是静态站点，通过 CORS 访问本 API。

目录：`cloudflare/api`。以下命令都在该目录下执行，统一使用 `npx wrangler@4`。

## 一、准备

- Node.js 20+（推荐 22）
- 一个 Cloudflare 账号
- 一个已开启 SMTP 服务的 QQ 邮箱，并取得**授权码**（不是 QQ 登录密码）

## 二、登录并创建 D1 数据库

```bash
cd cloudflare/api
npx wrangler@4 login
npx wrangler@4 d1 create hot-radar
```

命令会输出 `database_id`。打开 [wrangler.toml](./wrangler.toml)，把 `database_id` 一行的 `REPLACE_WITH_D1_ID` 替换成真实值：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> 本地 `wrangler dev` 可以先用占位值；**远程 deploy 前必须替换**。

## 三、配置邮件机密

```bash
npx wrangler@4 secret put MAIL_USER   # QQ 邮箱地址，如 235173498@qq.com
npx wrangler@4 secret put MAIL_PASS   # QQ 邮箱 SMTP 授权码（不是 QQ 密码）
```

可选检查：

```bash
npx wrangler@4 secret list
```

密钥只保存在 Cloudflare，不写入仓库。请勿把授权码写进 `wrangler.toml` 或任何源码。

## 四、部署

```bash
npx wrangler@4 deploy
```

部署成功后会得到类似 `https://hot-radar-api.<你的子域>.workers.dev` 的地址。先验证健康检查：

```bash
curl https://hot-radar-api.<你的子域>.workers.dev/api/health
# {"ok":true,"time":"...","service":"hot-radar-api"}
```

表结构会在首次请求时由 Worker 幂等自动创建（`CREATE TABLE IF NOT EXISTS`），无需手动迁移。若希望走 wrangler 迁移流程，可执行：

```bash
npx wrangler@4 d1 migrations apply hot-radar --remote
```

## 五、自定义域名与备用线路

已启用 `hotradar-api.mindofqc.dpdns.org` 自定义域名，同时 `workers_dev = true` 保留 workers.dev 备用入口：

```toml
workers_dev = true
routes = [
  { pattern = "hotradar-api.mindofqc.dpdns.org", custom_domain = true }
]
```

域名未托管在同一个 Cloudflare 账号时，删除 `routes` 并重新部署，否则部署会失败。绑定后两个地址都可访问：

- `https://hot-radar-api.<你的子域>.workers.dev`
- `https://hotradar-api.mindofqc.dpdns.org`

## 六、前端 API base

前端只需要 Worker **根地址**（不带末尾 `/`、不带 `/api`）：

```ts
"https://hotradar-api.mindofqc.dpdns.org" // 默认线路
// 或 "https://hot-radar-api.qixin-study.workers.dev" // workers.dev 备用线路
```

前端请求路径为 `${apiBase}/api/auth/login`、`${apiBase}/api/chat` 等。本地开发使用 Vite 的 `/api` 代理（指向 `http://127.0.0.1:8787`）。生产构建可以固定线路：

```bash
VITE_API_BASE=https://hotradar-api.mindofqc.dpdns.org npm run build
```

不设置 `VITE_API_BASE` 时默认使用自定义域名；用户也可以在「设置 → 账号服务线路」里切换两条线路，并测试连通性。这样在不同网络环境下都能找到可用入口。

CORS 白名单（不使用 cookie，登录态只走 `Authorization: Bearer`）：

- `https://qoder.website`、`https://*.qoder.website`（如线上站点 `https://hot-radar-j8vzdjdlheu.qoder.website`）
- `http://localhost:*`、`http://127.0.0.1:*`

其他来源不会收到 `Access-Control-Allow-Origin`。

## 七、管理员规则

- 管理员由 `wrangler.toml` 的 `[vars] ADMIN_NICKNAME` 指定，当前为 `ordeal`，全站只有这一个账号能看数据看板。
- 首次解析时，Worker 找出**唯一**持有该昵称的账号，把它的 id 写进 D1 的 `hr_meta`（`key = admin_user_id`）。此后权限只认这个 id：该账号改名仍是管理员，其他人注册或改名成 `ordeal` 会被 `409 nickname_reserved` 拒绝。
- 若同昵称账号不止一个，则谁都不是管理员（fail closed）。需要换管理员时，删除 `hr_meta` 中 `admin_user_id` 一行并重新部署，让新昵称的唯一持有者重新认领：
  ```bash
  npx wrangler@4 d1 execute hot-radar --remote --command "DELETE FROM hr_meta WHERE key = 'admin_user_id'"
  ```
- 旧的 `ADMIN_EMAIL` 邮箱白名单与 `hr_users.is_admin` 已废弃，历史值不再授予任何权限。
- 本地开发在 `.dev.vars` 里写 `ADMIN_NICKNAME=ordeal`，用该昵称注册一个账号即可看到看板。
- 修改后需重新部署（本地重启 `wrangler dev`）。
- 只有管理员能访问 `GET /api/admin/stats`，其他账号返回 `403 forbidden`。普通用户看不到入口，也不会拿到数据。

## 八、本地开发

```bash
cd cloudflare/api
cp .dev.vars.example .dev.vars   # Windows 可手动复制
# 编辑 .dev.vars 填写 MAIL_USER / MAIL_PASS（仅需真实发信时）
npx wrangler@4 dev               # 默认 http://127.0.0.1:8787
```

`.dev.vars` 已被 `cloudflare/api/.gitignore` 忽略，**不要提交**。

开发模式规则：仅当 `ENVIRONMENT=development` 且 `DEV_RETURN_CODE=1`（`.dev.vars.example` 默认如此）时，`POST /api/auth/code` 不发送邮件，响应额外返回 `{"ok":true,"devCode":"123456"}` 并打印到终端。生产环境（`ENVIRONMENT=production`）绝不会返回 `devCode`；部署时不要把 `DEV_RETURN_CODE` 写进 `[vars]`。

本地 D1 由 wrangler 自动创建并持久化在 `.wrangler/` 下，首次请求会自动建表。需要清空本地库时可删除 `.wrangler/` 后重启。

## 九、常用排查

```bash
npx wrangler@4 tail                                  # 实时日志
npx wrangler@4 d1 execute hot-radar --remote --command "SELECT COUNT(*) FROM hr_users"
npx wrangler@4 d1 execute hot-radar --local  --command "SELECT COUNT(*) FROM hr_users"
```

- `mail_not_configured`：未配置 `MAIL_USER` / `MAIL_PASS`。
- `mail_failed`：SMTP 连接或认证失败，检查 QQ 邮箱授权码与发信频率。
- `code_wait`：同一邮箱 60 秒内重复获取验证码。
- `chat_slow_down`：对话室同一用户 2 秒内重复发送。
