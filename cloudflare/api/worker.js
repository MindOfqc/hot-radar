// 热点雷达 · 云端 API（Cloudflare Worker + D1）
// 能力：QQ 邮箱验证码注册 / 密码登录 / 找回密码 / 个人资料 / 在线心跳
//      对话室 / 仅管理员可见的全站统计。
// 本 Worker 独立部署，所有表统一使用 hr_ 前缀，不复用任何其他项目的旧表。
import { sendVerificationEmail } from "./smtp.js";

const SERVICE_NAME = "hot-radar-api";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 90;
const SESSION_TTL_MS = SESSION_DAYS * 86_400_000;
const CODE_TTL_MS = 10 * 60_000;        // 验证码 10 分钟有效
const CODE_SEND_GAP_MS = 60_000;        // 同一邮箱 60 秒内只能发一次
const CHAT_COOLDOWN_MS = 2_000;         // 对话室同用户 2 秒冷却
const ONLINE_WINDOW_MS = 5 * 60_000;    // 5 分钟内有心跳视为在线

const MAX_BODY_BYTES = 160 * 1024;      // 请求体上限（含头像 base64）
const MAX_AVATAR_BYTES = 32 * 1024;     // 头像 base64 上限
const MAX_BIO_BYTES = 200;              // 个性签名上限
const MAX_CONTENT_CHARS = 500;          // 对话消息字符上限
const MAX_CONTENT_BYTES = 4_000;        // 对话消息 UTF-8 字节上限
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;
const NICKNAME_MAX = 24;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

/* ---------------- CORS：仅回显受信任来源，不使用 cookie ---------------- */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();

  // 生产前端：https://qoder.website 与 https://*.qoder.website
  if (host === "qoder.website" || host.endsWith(".qoder.website")) {
    return url.protocol === "https:";
  }
  // 本地开发：http://localhost:* 与 http://127.0.0.1:*
  if (host === "localhost" || host === "127.0.0.1") {
    return url.protocol === "http:";
  }
  return false;
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const headers = {
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (isAllowedOrigin(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/* ---------------- 基础工具 ---------------- */
function toBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

async function deriveHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  const bits = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const charLength = (value) => Array.from(value).length;

function validEmail(email) {
  return typeof email === "string" && email.length <= 64 && EMAIL_RE.test(email);
}
function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN &&
    password.length <= PASSWORD_MAX
  );
}
function validCode(code) {
  return typeof code === "string" && /^\d{6}$/.test(code);
}
function cleanNickname(value) {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || charLength(text) > NICKNAME_MAX) return "";
  return text;
}
function cleanBio(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (encoder.encode(text).length > MAX_BIO_BYTES) return null;
  return text;
}
/** 返回清洗后的头像字符串；不合法 / 过大返回 null，空字符串表示清空头像。 */
function cleanAvatar(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return "";
  if (text.startsWith("data:image/")) {
    return text.length <= MAX_AVATAR_BYTES ? text : null;
  }
  const short = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!short || encoder.encode(short).length > 32) return null;
  return short;
}

/**
 * 读取并校验 JSON 请求体：content-type、体积、对象形态。
 * 失败时返回 { ok:false, status }，由调用方统一映射为 invalid_input。
 */
async function readBody(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) return { ok: false, status: 400 };

  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (encoder.encode(text).length > MAX_BODY_BYTES) return { ok: false, status: 413 };

  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400 };
    }
    return { ok: true, body: value };
  } catch {
    return { ok: false, status: 400 };
  }
}

/* ---------------- 登录地点：优先 Cloudflare 边缘自带的地理信息 ---------------- */
function locate(request) {
  // 经 Qoder Site 同源函数转发时，cf-connecting-ip / request.cf 是函数节点的，
  // 使用函数带来的访客信息，避免把代理节点位置当成用户位置。
  const proxied = request.headers.get("x-hotradar-proxy") === "qoder-sites";
  if (proxied) {
    const ip = request.headers.get("x-hotradar-client-ip") || "";
    const country = request.headers.get("x-hotradar-country") || "";
    return { ip, location: country ? `经站点代理 · ${country}` : "经站点代理" };
  }

  const cf = request.cf || {};
  const parts = [cf.city, cf.region, cf.country].filter(
    (part) => typeof part === "string" && part,
  );
  const location = parts.length ? parts.join(" · ") : "未知";
  const ip = request.headers.get("cf-connecting-ip") || "";
  return { ip, location };
}

function adminNickname(env) {
  return String(env.ADMIN_NICKNAME || "ordeal").trim().toLowerCase();
}

/**
 * 管理员是一个固定账号，不是"谁叫这个昵称谁就是"。
 * 昵称只用于首次认领：唯一持有者被写进 hr_meta 后，权限就跟着 id 走，
 * 之后改名、注销昵称或被别人抢注都不会转移权限。
 */
let cachedAdminId = "";
async function adminUserId(env) {
  if (cachedAdminId) return cachedAdminId;
  const pinned = await env.DB.prepare(
    "SELECT value FROM hr_meta WHERE key = 'admin_user_id'",
  ).first();
  if (pinned?.value) {
    cachedAdminId = String(pinned.value);
    return cachedAdminId;
  }
  const holders = await env.DB.prepare(
    "SELECT id FROM hr_users WHERE lower(nickname) = ?",
  )
    .bind(adminNickname(env))
    .all();
  const ids = (holders.results || []).map((row) => row.id);
  // 同名账号不止一个时不授予任何人，避免歧义账号拿到全站数据。
  if (ids.length !== 1) return "";
  await env.DB.prepare(
    "INSERT INTO hr_meta (key, value) VALUES ('admin_user_id', ?)",
  )
    .bind(ids[0])
    .run();
  cachedAdminId = ids[0];
  return cachedAdminId;
}

/** 管理员昵称只归已绑定的账号；未绑定时第一个认领者成为管理员。 */
async function nicknameReserved(env, nickname, selfId) {
  if (nickname.toLowerCase() !== adminNickname(env)) return false;
  const adminId = await adminUserId(env);
  return Boolean(adminId) && adminId !== selfId;
}

function publicUser(row, isAdmin) {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatar: row.avatar || "",
    bio: row.bio || "",
    isAdmin,
  };
}

async function createSession(env, userId, request) {
  const token = toBase64Url(randomBytes(32));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const { ip, location } = locate(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  await env.DB.prepare(
    "INSERT INTO hr_sessions (token, user_id, created_at, expires_at, last_seen_at, user_agent, ip, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(token, userId, now.toISOString(), expiresAt, now.toISOString(), ua, ip, location)
    .run();
  return { token, expiresAt };
}

async function authenticate(env, request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const row = await env.DB.prepare(
    "SELECT s.user_id, s.token, s.expires_at, u.email, u.nickname, u.avatar, u.bio FROM hr_sessions s JOIN hr_users u ON u.id = s.user_id WHERE s.token = ?",
  )
    .bind(token)
    .first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;

  const isAdmin = (await adminUserId(env)) === row.user_id;
  return {
    userId: row.user_id,
    token: row.token,
    isAdmin,
    user: {
      id: row.user_id,
      email: row.email,
      nickname: row.nickname,
      avatar: row.avatar || "",
      bio: row.bio || "",
      isAdmin,
    },
  };
}

async function logLogin(env, userId, request) {
  const { ip, location } = locate(request);
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO hr_login_logs (id, user_id, ip, location, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), userId, ip, location, ua, createdAt)
    .run();
  return { ip, location, created_at: createdAt };
}

/* ---------------- 验证码 ---------------- */
async function handleSendCode(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return json({ error: "invalid_email" }, 400);

  const purpose = body.purpose;
  if (purpose !== "register" && purpose !== "reset") {
    return json({ error: "invalid_input" }, 400);
  }

  const exists = await env.DB.prepare("SELECT id FROM hr_users WHERE email = ?")
    .bind(email)
    .first();
  if (purpose === "register" && exists) return json({ error: "email_taken" }, 409);
  if (purpose === "reset" && !exists) return json({ error: "no_such_email" }, 404);

  // 同一邮箱 60 秒内只能发一次（注册 / 找回密码共用限制）
  const recent = await env.DB.prepare(
    "SELECT created_at FROM hr_email_codes WHERE email = ? AND created_at >= ?",
  )
    .bind(email, new Date(Date.now() - CODE_SEND_GAP_MS).toISOString())
    .first();
  if (recent) return json({ error: "code_wait" }, 429);

  const code = randomCode();
  const createdAt = new Date().toISOString();
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(
    "INSERT INTO hr_email_codes (email, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(email, purpose, codeHash, new Date(Date.now() + CODE_TTL_MS).toISOString(), createdAt)
    .run();

  // 开发模式：仅在 ENVIRONMENT=development 且 DEV_RETURN_CODE=1 时直接返回验证码。
  if (env.ENVIRONMENT === "development" && env.DEV_RETURN_CODE === "1") {
    console.log(`[hot-radar] dev verification code for ${email} (${purpose}): ${code}`);
    return json({ ok: true, devCode: code });
  }

  try {
    await sendVerificationEmail(env, email, code, purpose);
  } catch (err) {
    // 发送失败时撤销刚写入的验证码，避免用户被 60 秒冷却卡住又收不到邮件。
    try {
      await env.DB.prepare(
        "DELETE FROM hr_email_codes WHERE email = ? AND purpose = ? AND code_hash = ? AND created_at = ?",
      )
        .bind(email, purpose, codeHash, createdAt)
        .run();
    } catch {
      // 清理失败不影响错误响应
    }
    const message = String(err?.message || err);
    if (message.includes("mail_not_configured")) {
      return json({ error: "mail_not_configured" }, 503);
    }
    console.error("[hot-radar] verification mail failed:", message.slice(0, 120));
    return json({ error: "mail_failed" }, 502);
  }
  return json({ ok: true });
}

/** 校验验证码；consume=true 时标记已用。 */
async function verifyCode(env, email, purpose, code, consume) {
  const rows = await env.DB.prepare(
    "SELECT rowid, code_hash, expires_at, used_at FROM hr_email_codes WHERE email = ? AND purpose = ? AND expires_at >= ? AND used_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 5",
  )
    .bind(email, purpose, new Date().toISOString())
    .all();
  const hash = await sha256Hex(String(code));
  const hit = (rows.results || []).find((row) => safeEqual(hash, row.code_hash));
  if (!hit) return false;
  if (consume) {
    await env.DB.prepare("UPDATE hr_email_codes SET used_at = ? WHERE rowid = ?")
      .bind(new Date().toISOString(), hit.rowid)
      .run();
  }
  return true;
}

/* ---------------- 注册 / 登录 / 找回密码 ---------------- */
async function handleRegister(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;
  if (!validEmail(email) || !validPassword(password)) {
    return json({ error: "invalid_input" }, 400);
  }
  if (!validCode(body.code)) return json({ error: "invalid_code" }, 400);

  let nickname;
  if (body.nickname !== undefined && typeof body.nickname !== "string") {
    return json({ error: "invalid_input" }, 400);
  }
  if (typeof body.nickname === "string" && body.nickname.trim()) {
    nickname = cleanNickname(body.nickname);
    if (!nickname) return json({ error: "invalid_input" }, 400);
  } else {
    nickname = email.split("@")[0].slice(0, NICKNAME_MAX) || "雷达用户";
  }

  const exists = await env.DB.prepare("SELECT id FROM hr_users WHERE email = ?")
    .bind(email)
    .first();
  if (exists) return json({ error: "email_taken" }, 409);
  if (await nicknameReserved(env, nickname, "")) {
    return json({ error: "nickname_reserved" }, 409);
  }
  if (!(await verifyCode(env, email, "register", body.code, false))) {
    return json({ error: "invalid_code" }, 400);
  }

  const salt = toBase64(randomBytes(16));
  const hash = await deriveHash(password, salt);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(
      "INSERT INTO hr_users (id, email, nickname, avatar, bio, salt, password_hash, iterations, created_at, last_login_at) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?)",
    )
      .bind(id, email, nickname, salt, hash, PBKDF2_ITERATIONS, now, now)
      .run();
  } catch {
    return json({ error: "email_taken" }, 409);
  }

  const isAdmin = (await adminUserId(env)) === id;
  await verifyCode(env, email, "register", body.code, true);
  const lastLogin = await logLogin(env, id, request);
  const session = await createSession(env, id, request);
  return json(
    {
      ...session,
      user: { id, email, nickname, avatar: "", bio: "", isAdmin },
      lastLogin,
    },
    201,
  );
}

async function handleLogin(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email) || !validPassword(body.password)) {
    return json({ error: "invalid_credentials" }, 401);
  }

  const row = await env.DB.prepare(
    "SELECT id, email, nickname, avatar, bio, salt, password_hash FROM hr_users WHERE email = ?",
  )
    .bind(email)
    .first();

  // 无论账号是否存在都执行一次 PBKDF2，避免通过响应时间枚举邮箱。
  const salt = row?.salt ?? toBase64(randomBytes(16));
  const hash = await deriveHash(body.password, salt);
  if (!row || !safeEqual(hash, row.password_hash)) {
    return json({ error: "invalid_credentials" }, 401);
  }

  const now = new Date().toISOString();
  const isAdmin = (await adminUserId(env)) === row.id;
  await env.DB.prepare("UPDATE hr_users SET last_login_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();
  await env.DB.prepare("DELETE FROM hr_sessions WHERE expires_at < ?")
    .bind(new Date(Date.now() - 30 * 86_400_000).toISOString())
    .run();

  const lastLogin = await logLogin(env, row.id, request);
  const session = await createSession(env, row.id, request);
  return json({
    ...session,
    user: {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      avatar: row.avatar || "",
      bio: row.bio || "",
      isAdmin,
    },
    lastLogin,
  });
}

async function handleResetPassword(request, env) {
  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

  const body = parsed.body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const newPassword = body.newPassword;
  if (!validEmail(email) || !validPassword(newPassword)) {
    return json({ error: "invalid_input" }, 400);
  }
  if (!validCode(body.code)) return json({ error: "invalid_code" }, 400);
  if (!(await verifyCode(env, email, "reset", body.code, false))) {
    return json({ error: "invalid_code" }, 400);
  }

  const row = await env.DB.prepare("SELECT id FROM hr_users WHERE email = ?")
    .bind(email)
    .first();
  if (!row) return json({ error: "no_such_email" }, 404);

  const salt = toBase64(randomBytes(16));
  const hash = await deriveHash(newPassword, salt);
  await env.DB.prepare(
    "UPDATE hr_users SET salt = ?, password_hash = ?, iterations = ? WHERE id = ?",
  )
    .bind(salt, hash, PBKDF2_ITERATIONS, row.id)
    .run();
  await verifyCode(env, email, "reset", body.code, true);
  // 重置密码后让所有旧会话失效
  await env.DB.prepare("DELETE FROM hr_sessions WHERE user_id = ?").bind(row.id).run();
  return json({ ok: true });
}

async function handleMe(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const last = await env.DB.prepare(
    "SELECT ip, location, created_at FROM hr_login_logs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  )
    .bind(auth.userId)
    .first();
  return json({ user: auth.user, lastLogin: last || null });
}

async function handleLogout(request, env) {
  const auth = await authenticate(env, request);
  if (auth) {
    await env.DB.prepare("DELETE FROM hr_sessions WHERE token = ?").bind(auth.token).run();
  }
  return new Response(null, { status: 204 });
}

/* ---------------- 用户资料 ---------------- */
async function handleProfile(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  if (request.method === "PUT") {
    const parsed = await readBody(request);
    if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

    const body = parsed.body;
    let nickname = auth.user.nickname;
    let avatar = auth.user.avatar || "";
    let bio = auth.user.bio || "";

    if (body.nickname !== undefined) {
      const cleaned = cleanNickname(body.nickname);
      if (!cleaned) return json({ error: "invalid_input" }, 400);
      if (await nicknameReserved(env, cleaned, auth.userId)) {
        return json({ error: "nickname_reserved" }, 409);
      }
      nickname = cleaned;
    }
    if (body.avatar !== undefined) {
      const cleaned = cleanAvatar(body.avatar);
      if (cleaned === null) return json({ error: "invalid_input" }, 413);
      avatar = cleaned;
    }
    if (body.bio !== undefined) {
      const cleaned = cleanBio(body.bio);
      if (cleaned === null) return json({ error: "invalid_input" }, 400);
      bio = cleaned;
    }

    await env.DB.prepare("UPDATE hr_users SET nickname = ?, avatar = ?, bio = ? WHERE id = ?")
      .bind(nickname, avatar, bio, auth.userId)
      .run();
  }

  const row = await env.DB.prepare("SELECT * FROM hr_users WHERE id = ?")
    .bind(auth.userId)
    .first();
  return json({ user: publicUser(row, (await adminUserId(env)) === auth.userId) });
}

/* ---------------- 在线心跳 ---------------- */
async function handlePresence(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const { ip, location } = locate(request);
  await env.DB.prepare(
    "UPDATE hr_sessions SET last_seen_at = ?, ip = ?, location = ? WHERE token = ?",
  )
    .bind(new Date().toISOString(), ip, location, auth.token)
    .run();
  return json({ ok: true });
}

/* ---------------- 对话室 ---------------- */
async function chatList(request, env, url) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const limitRaw = url.searchParams.get("limit");
  let limit = 100;
  if (limitRaw && /^\d+$/.test(limitRaw)) {
    limit = Math.min(200, Math.max(1, Number(limitRaw)));
  }

  const result = await env.DB.prepare(
    "SELECT id, user_id, nickname, avatar, content, created_at FROM hr_chat_messages ORDER BY created_at DESC, rowid DESC LIMIT ?",
  )
    .bind(limit)
    .all();

  const messages = (result.results || []).reverse().map((row) => ({
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    avatar: row.avatar || "",
    content: row.content,
    createdAt: row.created_at,
  }));
  return json({ messages, now: new Date().toISOString() });
}

async function chatCreate(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const parsed = await readBody(request);
  if (!parsed.ok) return json({ error: "invalid_input" }, parsed.status);

  const raw = parsed.body.content;
  const content = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if (
    !content ||
    charLength(content) > MAX_CONTENT_CHARS ||
    encoder.encode(content).length > MAX_CONTENT_BYTES
  ) {
    return json({ error: "invalid_input" }, 400);
  }

  const last = await env.DB.prepare(
    "SELECT created_at FROM hr_chat_messages WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  )
    .bind(auth.userId)
    .first();
  if (last && Date.now() - Date.parse(last.created_at) < CHAT_COOLDOWN_MS) {
    return json({ error: "chat_slow_down" }, 429);
  }

  const row = await env.DB.prepare("SELECT nickname, avatar FROM hr_users WHERE id = ?")
    .bind(auth.userId)
    .first();
  const message = {
    id: crypto.randomUUID(),
    userId: auth.userId,
    nickname: row?.nickname || auth.user.nickname,
    avatar: row?.avatar || "",
    content,
    createdAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    "INSERT INTO hr_chat_messages (id, user_id, nickname, avatar, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      message.id,
      message.userId,
      message.nickname,
      message.avatar,
      message.content,
      message.createdAt,
    )
    .run();
  return json({ message }, 201);
}

/* ---------------- 管理员统计（仅 admin） ---------------- */
async function countOf(env, sql, ...binds) {
  const row = await env.DB.prepare(sql).bind(...binds).first();
  return Number(row?.c ?? 0);
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "***";
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}***@${domain}`;
}

async function handleAdminStats(request, env) {
  const auth = await authenticate(env, request);
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (!auth.isAdmin) return json({ error: "forbidden" }, 403);

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const day14 = new Date(now.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS).toISOString();

  const [usersTotal, usersToday, usersWeek, online, chatsTotal, chatsToday] =
    await Promise.all([
      countOf(env, "SELECT COUNT(*) AS c FROM hr_users"),
      countOf(env, "SELECT COUNT(*) AS c FROM hr_users WHERE substr(created_at,1,10) >= ?", today),
      countOf(
        env,
        "SELECT COUNT(*) AS c FROM hr_users WHERE created_at >= ?",
        new Date(now.getTime() - 7 * 86_400_000).toISOString(),
      ),
      countOf(
        env,
        "SELECT COUNT(DISTINCT user_id) AS c FROM hr_sessions WHERE expires_at > ? AND COALESCE(last_seen_at, created_at) >= ?",
        nowIso,
        onlineSince,
      ),
      countOf(env, "SELECT COUNT(*) AS c FROM hr_chat_messages"),
      countOf(
        env,
        "SELECT COUNT(*) AS c FROM hr_chat_messages WHERE substr(created_at,1,10) >= ?",
        today,
      ),
    ]);

  // 近 14 天趋势：注册 / 登录 / 对话室消息
  const days = Array.from({ length: 14 }, (_, index) =>
    new Date(now.getTime() - (13 - index) * 86_400_000).toISOString().slice(0, 10),
  );
  const trendQuery = async (table, column) => {
    const result = await env.DB.prepare(
      `SELECT substr(${column},1,10) AS d, COUNT(*) AS c FROM ${table} WHERE ${column} >= ? GROUP BY d`,
    )
      .bind(`${day14}T00:00:00.000Z`)
      .all();
    const map = {};
    for (const row of result.results || []) map[row.d] = Number(row.c);
    return days.map((day) => ({ day, count: map[day] || 0 }));
  };
  const [registerTrend, loginTrend, chatTrend] = await Promise.all([
    trendQuery("hr_users", "created_at"),
    trendQuery("hr_login_logs", "created_at"),
    trendQuery("hr_chat_messages", "created_at"),
  ]);

  // 登录地点 Top 10
  const locResult = await env.DB.prepare(
    "SELECT COALESCE(NULLIF(location,''),'未知') AS location, COUNT(*) AS c FROM hr_login_logs GROUP BY COALESCE(NULLIF(location,''),'未知') ORDER BY c DESC LIMIT 10",
  ).all();

  // 最近注册用户 + 最近一次登录地点
  const recentResult = await env.DB.prepare(
    `SELECT u.email, u.nickname, u.created_at, u.last_login_at,
            (SELECT l.location FROM hr_login_logs l WHERE l.user_id = u.id ORDER BY l.created_at DESC, l.rowid DESC LIMIT 1) AS location
     FROM hr_users u ORDER BY u.created_at DESC, u.rowid DESC LIMIT 20`,
  ).all();

  return json({
    now: nowIso,
    totals: {
      users: usersTotal,
      usersToday,
      usersWeek,
      online,
      chats: chatsTotal,
      chatsToday,
    },
    trend: { days, register: registerTrend, login: loginTrend, chat: chatTrend },
    locations: (locResult.results || []).map((row) => ({
      location: row.location,
      count: Number(row.c),
    })),
    recentUsers: (recentResult.results || []).map((row) => ({
      email: maskEmail(row.email),
      nickname: row.nickname,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      location: row.location || "未知",
    })),
  });
}

/* ---------------- Schema 自检（首次请求幂等建表，免手动迁移） ---------------- */
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  const statements = [
    "CREATE TABLE IF NOT EXISTS hr_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, password_hash TEXT NOT NULL, iterations INTEGER NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS hr_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT, user_agent TEXT, ip TEXT, location TEXT)",
    "CREATE INDEX IF NOT EXISTS idx_hr_sessions_user ON hr_sessions (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_hr_sessions_expires ON hr_sessions (expires_at)",
    "CREATE TABLE IF NOT EXISTS hr_email_codes (email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_hr_email_codes_email ON hr_email_codes (email, purpose)",
    "CREATE TABLE IF NOT EXISTS hr_login_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_hr_login_logs_user ON hr_login_logs (user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_hr_login_logs_time ON hr_login_logs (created_at)",
    "CREATE TABLE IF NOT EXISTS hr_chat_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_hr_chat_messages_time ON hr_chat_messages (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_hr_chat_messages_user ON hr_chat_messages (user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_hr_users_created ON hr_users (created_at)",
    "CREATE TABLE IF NOT EXISTS hr_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReady = true;
}

/* ---------------- 路由 ---------------- */
async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;

  if (p === "/api/health" && m === "GET") {
    return json({ ok: true, time: new Date().toISOString(), service: SERVICE_NAME });
  }

  if (!p.startsWith("/api/")) return json({ error: "not_found" }, 404);
  if (!env.DB) return json({ error: "server_error" }, 503);

  await ensureSchema(env);

  if (p === "/api/auth/code" && m === "POST") return handleSendCode(request, env);
  if (p === "/api/auth/register" && m === "POST") return handleRegister(request, env);
  if (p === "/api/auth/login" && m === "POST") return handleLogin(request, env);
  if (p === "/api/auth/password" && m === "POST") return handleResetPassword(request, env);
  if (p === "/api/auth/me" && m === "GET") return handleMe(request, env);
  if (p === "/api/auth/logout" && m === "POST") return handleLogout(request, env);
  if (p === "/api/user/profile" && (m === "GET" || m === "PUT")) return handleProfile(request, env);
  if (p === "/api/presence" && m === "POST") return handlePresence(request, env);
  if (p === "/api/chat" && m === "GET") return chatList(request, env, url);
  if (p === "/api/chat" && m === "POST") return chatCreate(request, env);
  if (p === "/api/admin/stats" && m === "GET") return handleAdminStats(request, env);

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    let response;
    try {
      response = await route(request, env);
    } catch (err) {
      // 仅服务端日志保留细节；响应只返回稳定 code，避免泄露 SQL / 密钥。
      console.error("[hot-radar] unhandled error:", String(err?.message || err).slice(0, 200));
      response = json({ error: "server_error" }, 500);
    }
    return withCors(response, cors);
  },
};
