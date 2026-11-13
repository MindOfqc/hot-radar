/* 热点雷达账号服务客户端：所有请求走独立的 Cloudflare Worker。 */

const TOKEN_KEY = 'hotradar:auth-token';
const API_BASE_KEY = 'hotradar:api-base';

export const API_PRESETS = [
  {
    id: 'custom',
    label: '默认线路',
    base: 'https://hotradar-api.mindofqc.dpdns.org',
  },
  {
    id: 'workers',
    label: '备用线路',
    base: 'https://hot-radar-api.qixin-study.workers.dev',
  },
] as const;

const DEFAULT_API_BASE = API_PRESETS[0].base;

/** 开发环境走 Vite 的 /api 代理;生产可用设置页切换账号服务线路。 */
export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(API_BASE_KEY);
    if (stored) return stored.replace(/\/$/, '');
  } catch {
    /* 隐私模式下忽略 */
  }
  if (import.meta.env.DEV) return '';
  return ((import.meta.env.VITE_API_BASE as string | undefined) || DEFAULT_API_BASE).replace(
    /\/$/,
    '',
  );
}

export function setApiBase(base: string): void {
  try {
    localStorage.setItem(API_BASE_KEY, base.replace(/\/$/, ''));
  } catch {
    /* 忽略 */
  }
}

export function resetApiBase(): void {
  try {
    localStorage.removeItem(API_BASE_KEY);
  } catch {
    /* 忽略 */
  }
}

export interface CloudUser {
  id: string;
  email: string;
  nickname: string;
  avatar: string;
  bio: string;
  isAdmin: boolean;
}

export interface LastLogin {
  ip?: string;
  location?: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  avatar: string;
  content: string;
  createdAt: string;
  isAdmin: boolean;
}

export interface TrendPoint {
  day: string;
  count: number;
}

export interface AdminStats {
  now: string;
  totals: {
    users: number;
    usersToday: number;
    usersWeek: number;
    online: number;
    chats: number;
    chatsToday: number;
  };
  trend: {
    days: string[];
    register: TrendPoint[];
    login: TrendPoint[];
    chat: TrendPoint[];
  };
  locations: { location: string; count: number }[];
  recentUsers: {
    email: string;
    nickname: string;
    createdAt: string;
    lastLoginAt: string;
    location: string;
  }[];
}

const ERROR_TEXT: Record<string, string> = {
  invalid_input: '提交的内容格式不对，检查一下再试',
  invalid_email: '邮箱格式看起来不对',
  invalid_code: '验证码不对或已经过期',
  invalid_credentials: '邮箱或密码不对',
  invalid_nickname: '昵称不能为空',
  email_taken: '这个邮箱已经注册过了，直接登录吧',
  nickname_reserved: '这个昵称已经被占用了，换一个吧',
  no_such_email: '这个邮箱还没有注册',
  code_wait: '发送太频繁了，一分钟后再试',
  mail_failed: '验证码邮件发送失败，稍后再试',
  mail_not_configured: '邮件服务暂时不可用',
  avatar_too_large: '头像图片太大，换一张小一点的',
  chat_slow_down: '说得太快啦，歇两秒再发',
  unauthorized: '登录已过期，请重新登录',
  forbidden: '没有权限查看这里',
  not_found: '接口不存在',
  network: '网络不通，检查一下连接',
  invalid_response: '服务返回了无法识别的内容',
  cloud_unavailable: '账号服务暂时不可用',
  server_error: '服务开小差了，稍后再试',
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'server_error', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略 */
  }
}

export async function api<T>(
  path: string,
  {
    method = 'GET',
    body,
    signal,
  }: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(getApiBase() + path, {
      method,
      signal,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(ERROR_TEXT.network, 'network');
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(ERROR_TEXT.invalid_response, 'invalid_response', res.status);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(ERROR_TEXT.invalid_response, 'invalid_response', res.status);
  }

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'server_error';
    throw new ApiError(ERROR_TEXT[code] ?? ERROR_TEXT.server_error, code, res.status);
  }

  return data as T;
}
