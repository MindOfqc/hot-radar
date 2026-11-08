-- 管理员绑定：昵称只是首次认领的线索，认领后权限固定跟着账号 id。
-- Worker 首次请求也会幂等建表；本文件供 `wrangler d1 migrations` 使用。

CREATE TABLE IF NOT EXISTS hr_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- hr_users.is_admin 与 ADMIN_EMAIL 白名单已废弃，历史值不再授予任何权限。
UPDATE hr_users SET is_admin = 0 WHERE is_admin <> 0;