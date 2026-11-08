import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/avatar';
import { Button, Card, Input, Spinner } from '../components/ui';
import {
  CheckIcon,
  KeyIcon,
  LockIcon,
  LogoutIcon,
  MailIcon,
  RadarIcon,
  SparkIcon,
  UserIcon,
} from '../components/icons';

type Mode = 'login' | 'register' | 'reset';
type Notice = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const TITLES: Record<Mode, { title: string; sub: string; action: string }> = {
  login: { title: '登录雷达', sub: '继续你的热点追踪', action: '登录' },
  register: { title: '创建账号', sub: '第一次来，先登个记', action: '注册并登录' },
  reset: { title: '找回密码', sub: '验证邮箱后设置新密码', action: '重置密码' },
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export default function AuthPage({
  navigate,
  next,
}: {
  navigate: (to: string) => void;
  next?: string;
}) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  const meta = TITLES[mode];
  const target = useMemo(() => next || 'profile', [next]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    setCode('');
    setNotice(null);
  }, [mode]);

  async function requestCode() {
    if (!validEmail(email.trim())) {
      setNotice({ kind: 'err', text: '先填一个可用的邮箱地址' });
      return;
    }
    if (countdown > 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const response = await auth.sendCode(email.trim(), mode === 'reset' ? 'reset' : 'register');
      setCountdown(60);
      setNotice({
        kind: 'info',
        text: response?.devCode
          ? `验证码已生成：${response.devCode}（本地调试显示）`
          : '验证码已经寄出，去邮箱看看',
      });
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : '验证码发送失败' });
    } finally {
      setSending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!validEmail(trimmedEmail)) {
      setNotice({ kind: 'err', text: '邮箱格式看起来不对' });
      return;
    }
    if (mode !== 'login' && !/^\d{6}$/.test(code.trim())) {
      setNotice({ kind: 'err', text: '验证码是 6 位数字' });
      return;
    }
    if (mode === 'register' && !nickname.trim()) {
      setNotice({ kind: 'err', text: '给自己起一个昵称吧' });
      return;
    }
    if (mode !== 'reset' && password.length < 6) {
      setNotice({ kind: 'err', text: '密码至少 6 位' });
      return;
    }
    if (mode === 'reset' && newPassword.length < 6) {
      setNotice({ kind: 'err', text: '新密码至少 6 位' });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'login') {
        await auth.login(trimmedEmail, password);
      } else if (mode === 'register') {
        await auth.register({
          email: trimmedEmail,
          code: code.trim(),
          password,
          nickname: nickname.trim(),
        });
      } else {
        await auth.resetPassword({ email: trimmedEmail, code: code.trim(), newPassword });
        setMode('login');
        setPassword('');
        setNotice({ kind: 'ok', text: '密码已经更新，用新密码登录吧' });
        return;
      }
      navigate(target);
    } catch (error) {
      setNotice({ kind: 'err', text: error instanceof Error ? error.message : '操作失败，稍后再试' });
    } finally {
      setBusy(false);
    }
  }

  if (!auth.ready) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center py-20">
        <Card className="flex items-center gap-3 px-6 py-5">
          <Spinner className="size-5 text-accent" />
          <span className="text-sm font-bold text-ink-soft">正在检查登录状态…</span>
        </Card>
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="mx-auto max-w-xl animate-rise space-y-4">
        <Card className="p-6 text-center">
          <Avatar person={auth.user} size={64} className="mx-auto" />
          <h2 className="mt-3 text-xl font-black">{auth.user.nickname}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{auth.user.email}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => navigate('profile')}>
              <UserIcon className="size-4" /> 个人资料
            </Button>
            {auth.user.isAdmin && (
              <Button variant="secondary" onClick={() => navigate('dashboard')}>
                <KeyIcon className="size-4" /> 数据看板
              </Button>
            )}
            <Button onClick={() => navigate('boards')}>去看看热榜</Button>
          </div>
          <button
            type="button"
            onClick={() => {
              void auth.logout();
            }}
            className="mt-4 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-muted transition-colors hover:text-danger"
          >
            <LogoutIcon className="size-3.5" /> 退出当前账号
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl animate-rise space-y-4">
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-12 -rotate-6 place-items-center rounded-blob-1 border-toon bg-accent shadow-toon-sm">
          <RadarIcon className="size-7" />
        </span>
        <div>
          <h2 className="text-2xl font-black tracking-wide">{meta.title}</h2>
          <p className="text-[13px] font-semibold text-muted">{meta.sub}</p>
        </div>
        <SparkIcon className="ml-auto size-6 rotate-6" />
      </div>

      <Card className="p-5 sm:p-7">
        <div className="mb-5 flex rounded-btn border-toon-sm bg-paper p-1">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              aria-pressed={mode === item}
              className={`flex-1 cursor-pointer rounded-[10px] px-3 py-1.5 text-[13px] font-black transition-all duration-100 ${
                mode === item
                  ? '-rotate-1 border-[2.5px] border-ink bg-yellow shadow-toon-sm'
                  : 'border-[2.5px] border-transparent text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <Input
            label="邮箱"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={busy}
          />

          {mode === 'register' && (
            <Input
              label="昵称"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="在雷达上怎么称呼你"
              maxLength={24}
              autoComplete="nickname"
              disabled={busy}
            />
          )}

          {mode !== 'login' && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">邮箱验证码</span>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位数字"
                  autoComplete="one-time-code"
                  disabled={busy}
                  className="h-9.5 min-w-0 flex-1 rounded-btn border-[3px] border-ink bg-surface px-3 font-mono text-sm font-bold tracking-[0.2em] text-ink outline-none transition-all duration-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-muted focus:shadow-toon-sm"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9.5 shrink-0"
                  disabled={busy || sending || countdown > 0}
                  onClick={() => void requestCode()}
                >
                  {sending ? <Spinner className="size-3.5" /> : <MailIcon className="size-3.5" />}
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </Button>
              </div>
            </label>
          )}

          {mode !== 'reset' && (
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={busy}
            />
          )}

          {mode === 'reset' && (
            <Input
              label="新密码"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
              disabled={busy}
            />
          )}

          {notice && (
            <p
              role={notice.kind === 'err' ? 'alert' : 'status'}
              className={`flex items-start gap-1.5 rounded-btn border-[2.5px] px-3 py-2 text-xs font-bold leading-relaxed ${
                notice.kind === 'err'
                  ? 'border-danger/50 bg-accent-soft text-danger'
                  : notice.kind === 'ok'
                    ? 'border-teal/40 bg-teal-soft text-teal'
                    : 'border-ink/20 bg-yellow-soft text-ink-soft'
              }`}
            >
              {notice.kind === 'ok' && <CheckIcon className="mt-0.5 size-3.5 shrink-0" />}
              {notice.kind === 'err' && <LockIcon className="mt-0.5 size-3.5 shrink-0" />}
              {notice.kind === 'info' && <MailIcon className="mt-0.5 size-3.5 shrink-0" />}
              {notice.text}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Spinner className="size-4" /> : <CheckIcon className="size-4" />}
            {busy ? '处理中…' : meta.action}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs font-bold text-muted">
          {mode === 'reset' ? (
            <button
              type="button"
              onClick={() => setMode('login')}
              className="cursor-pointer transition-colors hover:text-accent-deep"
            >
              想起密码了，去登录
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="cursor-pointer transition-colors hover:text-accent-deep"
            >
              忘记密码？
            </button>
          )}
          <span className="inline-flex items-center gap-1">
            <LockIcon className="size-3.5" /> 账号仅用于本站
          </span>
        </div>
      </Card>

      <p className="px-2 text-center text-xs font-semibold leading-relaxed text-muted">
        登录后可以保存个人资料、进入对话室；管理员还能查看数据看板。
      </p>
    </div>
  );
}
