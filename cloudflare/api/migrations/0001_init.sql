-- 热点雷达 · 账号 / 会话 / 验证码 / 登录日志 / 对话室
-- 表名统一使用 hr_ 前缀，与其他项目的旧表完全独立。
-- Worker 首次请求也会幂等执行同样的 DDL；本文件供 `wrangler d1 migrations` 使用。

CREATE TABLE IF NOT EXISTS hr_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_users_created ON hr_users (created_at);

CREATE TABLE IF NOT EXISTS hr_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  user_agent TEXT,
  ip TEXT,
  location TEXT
);

CREATE INDEX IF NOT EXISTS idx_hr_sessions_user ON hr_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_hr_sessions_expires ON hr_sessions (expires_at);

-- 邮箱验证码（注册 / 找回密码共用，只存 SHA-256 摘要）
CREATE TABLE IF NOT EXISTS hr_email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_email_codes_email ON hr_email_codes (email, purpose);

-- 登录日志（IP + 地点，供管理员看板统计）
CREATE TABLE IF NOT EXISTS hr_login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_login_logs_user ON hr_login_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hr_login_logs_time ON hr_login_logs (created_at);

-- 对话室（登录用户之间交流）
CREATE TABLE IF NOT EXISTS hr_chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_chat_messages_time ON hr_chat_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_hr_chat_messages_user ON hr_chat_messages (user_id, created_at);
